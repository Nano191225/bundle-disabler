import { Block, Container, Entity, ItemStack, system, Vector3, world } from "@minecraft/server";

/**全プレイヤーの半径nブロックにあるブロックすべてに対して + プレイヤーがブロックを右クリックしたとき
ブロックがインベントリを持っていたら各スロットをすべてチェック
スロットのアイテムがバンドルなら削除 */

world.afterEvents.worldLoad.subscribe(() => {
  console.info('[BundleDisabler] Loaded!');
  console.info(`[BundleDisabler] 半径: ${world.getPackSettings()['tn:radius']}ブロック`);
});

let elapsedProcessTimes: number[] = [];
let adjustedRadius = world.getPackSettings()['tn:radius'] as number;
const allowedProcessTime = world.getPackSettings()['tn:process_time'] as number;

system.runInterval(() => {
  const time = Date.now();
  const players = world.getPlayers();
  const player = players[system.currentTick % players.length];
  if (!player?.isValid) return;

  const { x: bx, y: by, z: bz } = player.location;
  const range = player.dimension.heightRange;

  for (let y = Math.max(range.min, by - adjustedRadius); y <= Math.min(range.max, by + adjustedRadius); y++) {
    for (let dx = -adjustedRadius; dx <= adjustedRadius; dx++) {
      for (let dz = -adjustedRadius; dz <= adjustedRadius; dz++) {
        const pos = { x: bx + dx, y, z: bz + dz };
        const block = player.dimension.getBlock(pos);
        if (!block) continue;
        checkBlock(block);
      }
    }
  }

  // entity
  const entities = player.dimension.getEntities({
    location: player.location,
    maxDistance: adjustedRadius,
  });

  for (const entity of entities) {
    checkEntity(entity);
  }
  const elapsed = Date.now() - time;
  // if (elapsed > 1) console.warn(`[BundleDisabler] チェックに ${elapsed}ms かかりました (プレイヤー: ${player.name})`);
  elapsedProcessTimes.push(elapsed);
  if (elapsedProcessTimes.length > 5) {
    elapsedProcessTimes.shift();
    const average = elapsedProcessTimes.reduce((a, b) => a + b, 0) / elapsedProcessTimes.length;
    if (average > allowedProcessTime) {
      adjustedRadius = Math.max(0, adjustedRadius - 1);
      console.warn(`[BundleDisabler] 平均処理時間 ${average.toFixed(2)}ms が許容値 ${allowedProcessTime}ms を超えたため、半径を ${adjustedRadius} に減らしました`);
      elapsedProcessTimes = [];
    }
  }
});

world.afterEvents.playerInteractWithBlock.subscribe(ev => {
  const block = ev.block;
  checkBlock(block);
});

world.afterEvents.entitySpawn.subscribe(ev => {
  if (!ev.entity.isValid) return;
  if (ev.entity.typeId !== 'minecraft:item') return;

  const itemComponent = ev.entity.getComponent("minecraft:item");
  if (!itemComponent) return;

  const itemStack = itemComponent.itemStack;
  if (isBundle(itemStack)) {
    const loc = ev.entity.location;
    ev.entity.remove();
    console.warn(`[BundleDisabler] ドロップしたバンドル (${formatLocation(loc)}) を削除しました`);
  }
});

function checkEntity(entity: Entity) {
  if (!entity.isValid) return;

  const inventoryComponent = entity.getComponent("minecraft:inventory");
  if (!inventoryComponent) return;

  const { container } = inventoryComponent;
  if (!container) return;

  const result = checkContainer(container);
  if (result > 0) {
    const loc = entity.location;
    console.warn(`[BundleDisabler] エンティティ ${entity.typeId} (${formatLocation(loc)}) から ${result} 個のバンドルを削除しました`);
  }
}

function checkBlock(block: Block) {
  if (!block.isValid) return;

  const inventoryComponent = block.getComponent("minecraft:inventory");
  if (!inventoryComponent) return;

  const { container } = inventoryComponent;
  if (!container) return;

  const result = checkContainer(container);
  if (result > 0) {
    console.warn(`[BundleDisabler] ブロック ${block.typeId} (${formatLocation(block.location)}) から ${result} 個のバンドルを削除しました`);
  }
}

/**
 * @returns removeされた個数
 */
function checkContainer(container: Container) {
  let removed = 0;
  for (let i = 0; i < container.size; i++) {
    const itemStack = container.getItem(i);
    if (!itemStack) continue;

    if (isBundle(itemStack)) {
      container.setItem(i);
      removed++;
    }
  }
  return removed;
}

function isBundle(itemStack: ItemStack) {
  return itemStack.hasComponent("minecraft:inventory");
}

function formatLocation(loc: Vector3) {
  return `${Math.floor(loc.x)}, ${Math.floor(loc.y)}, ${Math.floor(loc.z)}`;
}
