import { put, select, take } from 'redux-saga/effects'
import { getDirectionInfo } from 'utils/common'
import canTankMove from 'utils/canTankMove'
import * as selectors from 'utils/selectors'
import { Input, TankRecord } from 'types'

export default function* directionController(playerName: string, getPlayerInput: Function) {
  while (true) {
    const { delta }: Action.TickAction = yield take('TICK')
    const input: Input = yield* getPlayerInput(delta)
    if (input == null) {
      const tank: TankRecord = yield select(selectors.playerTank, playerName)
      if (tank == null) {
        continue
      }
      if (tank.moving) {
        yield put({ type: 'STOP_MOVE', tankId: tank.tankId })
      }
    } else if (input.type === 'turn') {
      const tank = yield select(selectors.playerTank, playerName)
      if (tank == null) {
        continue
      }
      const { direction } = input
      // 坦克进行转向时, 需要对坐标进行处理
      // 如果转向UP/DOWN, 则将x坐标转换到最近的8的倍数
      // 如果转向为LEFT/RIGHT, 则将y坐标设置为最近的8的倍数
      // 这样做是为了使坦克转向之后更容易的向前行驶, 因为障碍物(brick/steel/river)的坐标也总是4或8的倍数
      // 但是有的时候简单的使用Math.round来转换坐标, 可能使得坦克卡在障碍物中
      // 所以这里转向的时候, 需要同时尝试Math.floor和Math.ceil来转换坐标
      const turned = tank.set('direction', direction) // 转向之后的tank对象
      // 要进行校准的坐标字段
      const { xy } = getDirectionInfo(direction, true)
      const n = tank.get(xy) / 8
      const useFloor = turned.set(xy, Math.floor(n) * 8)
      const useCeil = turned.set(xy, Math.ceil(n) * 8)
      const canMoveWhenUseFloor = yield select(canTankMove, useFloor)
      const canMoveWhenUseCeil = yield select(canTankMove, useCeil)
      let movedTank
      if (!canMoveWhenUseFloor) {
        movedTank = useCeil
      } else if (!canMoveWhenUseCeil) {
        movedTank = useFloor
      } else { // use-round
        movedTank = turned.set(xy, Math.round(n) * 8)
      }
      yield put({
        type: 'MOVE',
        tankId: tank.tankId,
        tank: movedTank,
      })
    } else if (input.type === 'forward') {
      const tank: TankRecord = yield select(selectors.playerTank, playerName)
      if (tank == null) {
        continue
      }
      const speed = 48 / 1000 // todo
      const distance = Math.min(delta * speed, input.maxDistance || Infinity)

      const { xy, updater } = getDirectionInfo(tank.direction)
      const movedTank = tank.update(xy, updater(distance))
      if (yield select(canTankMove, movedTank)) {
        yield put({
          type: 'MOVE',
          tankId: tank.tankId,
          tank: movedTank,
        })
        if (!tank.moving) {
          yield put({ type: 'START_MOVE', tankId: tank.tankId })
        }
      }
    } else {
      throw new Error(`Invalid input: ${input}`)
    }
  }
}
