import { BigInt, Address } from "@graphprotocol/graph-ts";

import {
  TokenLaunched as TokenLaunchedEvent,
  SovryFactory as SovryFactoryContract,
} from "../generated/SovryFactory/SovryFactory";

import {
  TokensPurchased as TokensPurchasedEvent,
  TokensSold as TokensSoldEvent,
  TokensRedeemed as TokensRedeemedEvent,
  Graduated as GraduatedEvent,
  GraduationThresholdUpdated as GraduationThresholdUpdatedEvent,
  CurveParamsUpdated as CurveParamsUpdatedEvent,
  RoyaltyRevenueQueued as RoyaltyRevenueQueuedEvent,
  RoyaltyRevenueProcessed as RoyaltyRevenueProcessedEvent,
  RoyaltiesHarvested as RoyaltiesHarvestedEvent,
  RoyaltyStateUpdated as RoyaltyStateUpdatedEvent,
  SovryExchange as SovryExchangeContract,
} from "../generated/templates/SovryExchange/SovryExchange";

import {
  Launchpad,
  WrapperToken,
  User,
  Trade,
  Graduation,
  Redemption,
  Candle,
  GraduationThresholdUpdate,
  CurveParamsUpdate,
  TokenStat,
  ProtocolMetric,
  HarvestEvent,
  RevenueEvent,
  RoyaltyStateUpdate,
} from "../generated/schema";
import {
  SovryExchange as SovryExchangeTemplate,
  WrapperToken as WrapperTemplate,
} from "../generated/templates";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getOrCreateLaunchpad(id: string): Launchpad {
  let launchpad = Launchpad.load(id);
  if (launchpad == null) {
    launchpad = new Launchpad(id);
    launchpad.totalTokens = 0;
    launchpad.totalTrades = 0;
    launchpad.totalVolume = BigInt.zero();
    launchpad.totalFees = BigInt.zero();
  }
  return launchpad as Launchpad;
}

function getOrCreateProtocolMetric(launchpadId: string): ProtocolMetric {
  let metric = ProtocolMetric.load(launchpadId);
  if (metric == null) {
    metric = new ProtocolMetric(launchpadId);
    metric.launchpad = launchpadId;
    metric.totalRoyaltiesQueued = BigInt.zero();
    metric.totalRoyaltiesPushed = BigInt.zero();
    metric.totalHarvestedPreGrad = BigInt.zero();
    metric.totalHarvestedPostGrad = BigInt.zero();
    metric.totalBuybacks = BigInt.zero();
  }
  return metric as ProtocolMetric;
}

function getOrCreateTokenStat(wrapperId: string): TokenStat {
  let stat = TokenStat.load(wrapperId);
  if (stat == null) {
    stat = new TokenStat(wrapperId);
    stat.wrapper = wrapperId;
    stat.accumulatedFeesNative = BigInt.zero();
    stat.totalHarvested = BigInt.zero();
  }
  return stat as TokenStat;
}

function getOrCreateUser(id: string): User {
  let user = User.load(id);
  if (user == null) {
    user = new User(id);
  }
  return user as User;
}

function getOrCreateWrapper(
  launchpadId: string,
  wrapperAddress: Address,
): WrapperToken {
  let id = wrapperAddress.toHex();
  let wrapper = WrapperToken.load(id);
  if (wrapper == null) {
    wrapper = new WrapperToken(id);
    wrapper.launchpad = launchpadId;
    wrapper.rt = Address.zero();
    wrapper.ipAsset = Address.zero();
    wrapper.creator = Address.zero();
    wrapper.launchTime = BigInt.zero();
    wrapper.totalLocked = BigInt.zero();
    wrapper.graduated = false;
    wrapper.dexReserve = BigInt.zero();
    wrapper.initialCurveSupply = BigInt.zero();
    wrapper.totalRoyaltiesHarvested = BigInt.zero();
    wrapper.totalFees = BigInt.zero();
    wrapper.totalHarvestedAmount = BigInt.zero();
    wrapper.totalFeesPushed = BigInt.zero();
    wrapper.poolAddress = null;
    wrapper.lpTokenId = null;
    wrapper.createdAt = BigInt.zero();
    wrapper.updatedAt = BigInt.zero();
  }
  return wrapper as WrapperToken;
}

function updateCandle(
  wrapperAddr: Address,
  timestamp: BigInt,
  price: BigInt,
  volume: BigInt,
): void {
  let timeframes = [60, 900, 3600];

  for (let i = 0; i < timeframes.length; i++) {
    let interval = timeframes[i];
    let candleTimestamp = (timestamp.toI32() / interval) * interval;

    let candleId =
      wrapperAddr.toHex() +
      "-" +
      interval.toString() +
      "-" +
      candleTimestamp.toString();

    let candle = Candle.load(candleId);
    if (candle == null) {
      candle = new Candle(candleId);
      candle.wrapper = wrapperAddr.toHex();
      candle.interval = interval;
      candle.timestamp = BigInt.fromI32(candleTimestamp);
      candle.open = price;
      candle.high = price;
      candle.low = price;
      candle.close = price;
      candle.volume = volume;
    } else {
      if (price > candle.high) {
        candle.high = price;
      }
      if (price < candle.low) {
        candle.low = price;
      }
      candle.close = price;
      candle.volume = candle.volume.plus(volume);
    }

    candle.save();
  }
}

// -----------------------------------------------------------------------------
// Event Handlers
// -----------------------------------------------------------------------------

export function handleTokenLaunched(event: TokenLaunchedEvent): void {
  let launchpadId = event.address.toHex();
  let factory = SovryFactoryContract.bind(event.address);
  let exchangeResult = factory.try_exchange();
  if (!exchangeResult.reverted) {
    launchpadId = exchangeResult.value.toHex();
  }

  let existingLaunchpad = Launchpad.load(launchpadId);
  if (existingLaunchpad == null && !exchangeResult.reverted) {
    SovryExchangeTemplate.create(exchangeResult.value);
  }

  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapperId = event.params.wrapper.toHex();
  let wrapper = new WrapperToken(wrapperId);

  wrapper.launchpad = launchpadId;
  wrapper.rt = event.params.rt;
  wrapper.ipAsset = Address.zero();
  wrapper.creator = event.params.creator;
  wrapper.launchTime = event.params.launchTime;
  wrapper.totalLocked = event.params.amount;
  wrapper.dexReserve = BigInt.zero();      // can be enriched via calls if needed
  wrapper.initialCurveSupply = BigInt.zero();
  wrapper.totalRoyaltiesHarvested = BigInt.zero();
  wrapper.totalFees = BigInt.zero();
  wrapper.totalHarvestedAmount = BigInt.zero();
  wrapper.totalFeesPushed = BigInt.zero();
  wrapper.graduated = false;
  wrapper.poolAddress = null;
  wrapper.lpTokenId = null;
  wrapper.createdAt = event.block.timestamp;
  wrapper.updatedAt = event.block.timestamp;

  // Best-effort enrichment from Exchange state (does not revert indexing if call fails)
  if (!exchangeResult.reverted) {
    let exchange = SovryExchangeContract.bind(exchangeResult.value);
    let tokenResult = exchange.try_launchedTokens(event.params.wrapper);
    if (!tokenResult.reverted) {
      // tuple layout matches SovryExchange.LaunchedToken public mapping getter
      wrapper.ipAsset = tokenResult.value.value3;
      wrapper.totalLocked = tokenResult.value.value5;
      wrapper.graduated = tokenResult.value.value6;
      wrapper.totalRoyaltiesHarvested = tokenResult.value.value7;
      wrapper.dexReserve = tokenResult.value.value9;
      wrapper.initialCurveSupply = tokenResult.value.value10;
    }
  }

  wrapper.save();

  // Start indexing ERC20 transfers for this wrapper to track holders
  WrapperTemplate.create(event.params.wrapper);

  launchpad.totalTokens += 1;
  launchpad.save();
}

export function handleTokensRedeemed(event: TokensRedeemedEvent): void {
  let launchpadId = event.address.toHex();
  getOrCreateLaunchpad(launchpadId).save();

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  if (wrapper.totalLocked >= event.params.rtAmount) {
    wrapper.totalLocked = wrapper.totalLocked.minus(event.params.rtAmount);
  } else {
    wrapper.totalLocked = BigInt.zero();
  }
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let redeemer = getOrCreateUser(event.params.redeemer.toHex());

  let redemptionId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let redemption = new Redemption(redemptionId);
  redemption.wrapper = wrapper.id;
  redemption.redeemer = redeemer.id;
  redemption.wrapperAmount = event.params.wrapperAmount;
  redemption.rtAmount = event.params.rtAmount;
  redemption.recipient = event.params.recipient;
  redemption.txHash = event.transaction.hash;
  redemption.timestamp = event.block.timestamp;
  redemption.save();
}

export function handleTokensPurchased(event: TokensPurchasedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.updatedAt = event.block.timestamp;

  let user = getOrCreateUser(event.params.buyer.toHex());

  let tradeId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let trade = new Trade(tradeId);
  trade.wrapper = wrapper.id;
  trade.user = user.id;
  trade.type = "BUY";
  trade.amount = event.params.amount;
  trade.value = event.params.cost;
  let buyFee = event.params.feeAmount;
  trade.fee = buyFee;
  trade.txHash = event.transaction.hash;
  trade.timestamp = event.block.timestamp;
  trade.save();

  let grossValue = event.params.cost.plus(event.params.feeAmount);
  let price = BigInt.zero();
  if (!event.params.amount.equals(BigInt.zero())) {
    price = grossValue.div(event.params.amount);
  }
  updateCandle(event.params.wrapperToken, event.block.timestamp, price, grossValue);

  launchpad.totalTrades += 1;
  launchpad.totalVolume = launchpad.totalVolume.plus(event.params.cost);
  launchpad.totalFees = launchpad.totalFees.plus(buyFee);
  wrapper.totalFees = wrapper.totalFees.plus(buyFee);
  wrapper.save();
  launchpad.save();
}

export function handleTokensSold(event: TokensSoldEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let user = getOrCreateUser(event.params.seller.toHex());

  let tradeId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let trade = new Trade(tradeId);
  trade.wrapper = wrapper.id;
  trade.user = user.id;
  trade.type = "SELL";
  trade.amount = event.params.amount;
  trade.value = event.params.proceeds;
  let sellFee = event.params.feeAmount;
  trade.fee = sellFee;
  trade.txHash = event.transaction.hash;
  trade.timestamp = event.block.timestamp;
  trade.save();

  let grossProceeds = event.params.proceeds.plus(event.params.feeAmount);
  let price = BigInt.zero();
  if (!event.params.amount.equals(BigInt.zero())) {
    price = grossProceeds.div(event.params.amount);
  }
  updateCandle(event.params.wrapperToken, event.block.timestamp, price, grossProceeds);

  launchpad.totalTrades += 1;
  launchpad.totalVolume = launchpad.totalVolume.plus(event.params.proceeds);
  launchpad.totalFees = launchpad.totalFees.plus(sellFee);
  wrapper.totalFees = wrapper.totalFees.plus(sellFee);
  wrapper.save();
  launchpad.save();
}

export function handleRoyaltyRevenueQueued(event: RoyaltyRevenueQueuedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);
  let metric = getOrCreateProtocolMetric(launchpadId);
  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  let stat = getOrCreateTokenStat(wrapper.id);

  stat.accumulatedFeesNative = stat.accumulatedFeesNative.plus(event.params.amount);
  stat.save();

  metric.totalRoyaltiesQueued = metric.totalRoyaltiesQueued.plus(event.params.amount);
  metric.save();

  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();
  launchpad.save();
}

export function handleRoyaltyRevenueProcessed(event: RoyaltyRevenueProcessedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);
  let metric = getOrCreateProtocolMetric(launchpadId);
  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  let stat = getOrCreateTokenStat(wrapper.id);

  stat.accumulatedFeesNative = BigInt.zero();
  stat.save();

  metric.totalRoyaltiesPushed = metric.totalRoyaltiesPushed.plus(event.params.amount);
  metric.save();

  // Record revenue event (PUSH)
  let id = event.transaction.hash.toHex().concat("-").concat(event.logIndex.toString());
  let rev = new RevenueEvent(id);
  rev.txHash = event.transaction.hash;
  rev.token = wrapper.id;
  rev.amount = event.params.amount;
  rev.type = "PUSH";
  rev.timestamp = event.block.timestamp;
  rev.blockNumber = event.block.number;
  rev.save();

  wrapper.totalFeesPushed = wrapper.totalFeesPushed.plus(event.params.amount);
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();
  launchpad.save();
}

export function handleRoyaltiesHarvested(event: RoyaltiesHarvestedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);
  let metric = getOrCreateProtocolMetric(launchpadId);
  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  let stat = getOrCreateTokenStat(wrapper.id);

  stat.totalHarvested = stat.totalHarvested.plus(event.params.amount);
  stat.save();

  let isPostGrad = wrapper.graduated;
  if (isPostGrad) {
    metric.totalHarvestedPostGrad = metric.totalHarvestedPostGrad.plus(event.params.amount);
  } else {
    metric.totalHarvestedPreGrad = metric.totalHarvestedPreGrad.plus(event.params.amount);
  }
  metric.save();

  wrapper.totalRoyaltiesHarvested = wrapper.totalRoyaltiesHarvested.plus(event.params.amount);
  wrapper.totalHarvestedAmount = wrapper.totalHarvestedAmount.plus(event.params.amount);
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let id = event.transaction.hash.toHex().concat("-").concat(event.logIndex.toString());
  let harvested = new HarvestEvent(id);
  harvested.wrapper = wrapper.id;
  harvested.amount = event.params.amount;
  harvested.isPostGrad = isPostGrad;
  harvested.txHash = event.transaction.hash;
  harvested.timestamp = event.block.timestamp;
  harvested.save();

  let rev = new RevenueEvent(id.concat("-rev"));
  rev.txHash = event.transaction.hash;
  rev.token = wrapper.id;
  rev.amount = event.params.amount;
  rev.type = isPostGrad ? "HARVEST_BUYBACK" : "HARVEST_RESERVE";
  rev.timestamp = event.block.timestamp;
  rev.blockNumber = event.block.number;
  rev.save();

  launchpad.save();
}

export function handleGraduated(event: GraduatedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);

  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  wrapper.graduated = true;
  wrapper.poolAddress = event.params.poolAddress;
  let exchange = SovryExchangeContract.bind(event.address);
  let lpIdResult = exchange.try_lpTokenIds(event.params.wrapperToken);
  if (!lpIdResult.reverted) {
    wrapper.lpTokenId = lpIdResult.value;
  }
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  let gradId = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let grad = new Graduation(gradId);
  grad.token = wrapper.id;
  grad.totalLiquidity = event.params.liquidity;
  grad.pool = event.params.poolAddress;
  if (!lpIdResult.reverted) {
    grad.lpTokenId = lpIdResult.value;
  } else {
    grad.lpTokenId = null;
  }
  grad.txHash = event.transaction.hash;
  grad.timestamp = event.block.timestamp;
  grad.save();

  launchpad.save();
}

export function handleGraduationThresholdUpdated(
  event: GraduationThresholdUpdatedEvent,
): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);
  launchpad.save();

  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let update = new GraduationThresholdUpdate(id);
  update.launchpad = launchpadId;
  update.newThreshold = event.params.newThreshold;
  update.txHash = event.transaction.hash;
  update.timestamp = event.block.timestamp;
  update.save();
}

export function handleRoyaltyStateUpdated(event: RoyaltyStateUpdatedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);
  let wrapper = getOrCreateWrapper(launchpadId, event.params.wrapperToken);
  let stat = getOrCreateTokenStat(wrapper.id);

  // Update TokenStat with latest values from contract
  stat.totalHarvested = event.params.totalHarvested;
  stat.accumulatedFeesNative = event.params.accumulatedNative;
  stat.save();

  // Update wrapper totalRoyaltiesHarvested for consistency
  wrapper.totalRoyaltiesHarvested = event.params.totalHarvested;
  wrapper.updatedAt = event.block.timestamp;
  wrapper.save();

  // Create RoyaltyStateUpdate record for tracking
  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let stateUpdate = new RoyaltyStateUpdate(id);
  stateUpdate.wrapper = wrapper.id;
  stateUpdate.totalHarvested = event.params.totalHarvested;
  stateUpdate.accumulatedNative = event.params.accumulatedNative;
  stateUpdate.txHash = event.transaction.hash;
  stateUpdate.timestamp = event.block.timestamp;
  stateUpdate.blockNumber = event.block.number;
  stateUpdate.save();

  launchpad.save();
}

export function handleCurveParamsUpdated(event: CurveParamsUpdatedEvent): void {
  let launchpadId = event.address.toHex();
  let launchpad = getOrCreateLaunchpad(launchpadId);
  launchpad.save();

  let id = event.transaction.hash
    .toHex()
    .concat("-")
    .concat(event.logIndex.toString());

  let update = new CurveParamsUpdate(id);
  update.launchpad = launchpadId;
  update.basePrice = event.params.basePrice;
  update.priceIncrement = event.params.priceIncrement;
  update.txHash = event.transaction.hash;
  update.timestamp = event.block.timestamp;
  update.save();
}

