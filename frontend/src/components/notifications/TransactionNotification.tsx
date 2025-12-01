"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TransactionNotificationProps {
  address: string;
  amount: string;
  token: string;
  isBuy: boolean;
  position?: { top?: string; left?: string; right?: string; bottom?: string };
  onDismiss?: () => void;
  duration?: number;
}

export function TransactionNotification({
  address,
  amount,
  token,
  isBuy,
  position,
  onDismiss,
  duration = 8000,
}: TransactionNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Fade in
    setTimeout(() => setIsVisible(true), 10);

    // Auto-dismiss
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        onDismiss?.();
      }, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const shortenedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div
      className={cn(
        "absolute z-50 px-3 py-2 rounded-lg",
        "bg-zinc-900/90 backdrop-blur-sm border border-zinc-800",
        "text-sovry-green text-xs font-medium",
        "shadow-lg shadow-black/50",
        "transition-all duration-300",
        isVisible && !isExiting ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      )}
      style={position}
    >
      <div className="flex items-center gap-2">
        {isBuy ? (
          <TrendingUp className="h-3 w-3 text-sovry-green" />
        ) : (
          <TrendingDown className="h-3 w-3 text-sovry-pink" />
        )}
        <span>
          {shortenedAddress} {isBuy ? "bought" : "sold"} ${amount} {token}
        </span>
      </div>
    </div>
  );
}

// Container component for managing multiple notifications
interface TransactionNotificationsContainerProps {
  notifications: Array<{
    id: string;
    address: string;
    amount: string;
    token: string;
    isBuy: boolean;
  }>;
  onDismiss: (id: string) => void;
}

export function TransactionNotificationsContainer({
  notifications,
  onDismiss,
}: TransactionNotificationsContainerProps) {
  // Generate random positions for notifications
  const getRandomPosition = (index: number) => {
    const positions = [
      { top: "10%", right: "5%" },
      { top: "20%", right: "8%" },
      { bottom: "15%", left: "5%" },
      { bottom: "25%", left: "8%" },
      { top: "30%", right: "12%" },
      { bottom: "35%", right: "10%" },
    ];
    return positions[index % positions.length];
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {notifications.map((notification, index) => (
        <TransactionNotification
          key={notification.id}
          address={notification.address}
          amount={notification.amount}
          token={notification.token}
          isBuy={notification.isBuy}
          position={getRandomPosition(index)}
          onDismiss={() => onDismiss(notification.id)}
        />
      ))}
    </div>
  );
}

