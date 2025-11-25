import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Launched as LaunchedEvent,
  Bought as BoughtEvent,
  Sold as SoldEvent,
  Graduated as GraduatedEvent,
  RevenueInjected as RevenueInjectedEvent,
  WrapperDeployed as WrapperDeployedEvent,
  Redeemed as RedeemedEvent,
} from "../generated/SovryLaunchpad/SovryLaunchpad";
import {
  Launch,
  Trade,
  RevenueInjection,
  Graduation,
} from "../generated/schema";

export function handleLaunched(event: LaunchedEvent): void {
  const id = event.params.token.toHex();
  let launch = Launch.load(id);
  if (launch == null) {
    launch = new Launch(id);
  }
  launch.token = event.params.token;
  launch.creator = event.params.creator;
  launch.createdAt = event.block.timestamp;
  launch.save();
}

export function handleBought(event: BoughtEvent): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const trade = new Trade(id);
  trade.token = event.params.token;
  trade.trader = event.params.buyer;
  trade.isBuy = true;
  trade.amountIP = event.params.amountIP;
  trade.amountTokens = event.params.amountTokens;
  trade.timestamp = event.block.timestamp;
  trade.txHash = event.transaction.hash;
  trade.save();
}

export function handleSold(event: SoldEvent): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const trade = new Trade(id);
  trade.token = event.params.token;
  trade.trader = event.params.seller;
  trade.isBuy = false;
  trade.amountIP = event.params.amountIP;
  trade.amountTokens = event.params.amountTokens;
  trade.timestamp = event.block.timestamp;
  trade.txHash = event.transaction.hash;
  trade.save();
}

export function handleGraduated(event: GraduatedEvent): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const grad = new Graduation(id);
  grad.token = event.params.token;
  grad.pool = event.params.pool;
  grad.totalLiquidity = event.params.totalLiquidity;
  grad.timestamp = event.block.timestamp;
  grad.txHash = event.transaction.hash;
  grad.save();
}

export function handleRevenueInjected(event: RevenueInjectedEvent): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  const ri = new RevenueInjection(id);
  ri.token = event.params.token;
  ri.amount = event.params.amount;
  ri.timestamp = event.block.timestamp;
  ri.txHash = event.transaction.hash;
  ri.save();
}

// WrapperDeployed and Redeemed are primarily for analytics; the core entities
// already capture token + creator and trades, so we just ensure Launch exists.

export function handleWrapperDeployed(event: WrapperDeployedEvent): void {
  const id = event.params.wrapper.toHex();
  let launch = Launch.load(id);
  if (launch == null) {
    launch = new Launch(id);
    launch.token = event.params.wrapper;
    launch.creator = event.transaction.from;
    launch.createdAt = event.block.timestamp;
  }
  launch.save();
}

export function handleRedeemed(event: RedeemedEvent): void {
  // No separate entity for redemptions yet; this hook exists for future analytics.
  // Can be extended later to track cumulative redeemed amounts per wrapper/user.
}
