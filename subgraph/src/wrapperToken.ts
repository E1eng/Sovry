import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Transfer as TransferEvent } from "../generated/templates/WrapperToken/ERC20";
import { Holder, User } from "../generated/schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getOrCreateUser(id: string): User {
  let user = User.load(id);
  if (user == null) {
    user = new User(id);
  }
  return user as User;
}

function getOrCreateHolder(wrapperId: string, userId: string, timestamp: BigInt): Holder {
  let holderId = wrapperId.concat("-").concat(userId);
  let holder = Holder.load(holderId);
  if (holder == null) {
    holder = new Holder(holderId);
    holder.wrapper = wrapperId;
    holder.user = userId;
    holder.balance = BigInt.zero();
    holder.createdAt = timestamp;
  }
  holder.updatedAt = timestamp;
  return holder as Holder;
}

/**
 * Track ERC20 Transfer events for wrapper tokens to maintain full holder balances.
 */
export function handleTransfer(event: TransferEvent): void {
  let wrapperId = event.address.toHex();
  let from = event.params.from.toHex();
  let to = event.params.to.toHex();

  // Decrease balance for sender (ignore mints from zero address)
  if (from != ZERO_ADDRESS) {
    let fromUser = getOrCreateUser(from);
    let fromHolder = getOrCreateHolder(wrapperId, fromUser.id, event.block.timestamp);
    fromHolder.balance = fromHolder.balance.minus(event.params.value);
    fromHolder.save();
  }

  // Increase balance for recipient (ignore burns to zero address)
  if (to != ZERO_ADDRESS) {
    let toUser = getOrCreateUser(to);
    let toHolder = getOrCreateHolder(wrapperId, toUser.id, event.block.timestamp);
    toHolder.balance = toHolder.balance.plus(event.params.value);
    toHolder.save();
  }
}
