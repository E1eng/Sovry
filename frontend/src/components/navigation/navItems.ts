import { LayoutGrid, PlusCircle, User } from "lucide-react";

export const NAV_ITEMS = [
  { label: "Home", href: "/", icon: LayoutGrid },
  { label: "Create", href: "/create", icon: PlusCircle },
  { label: "Profile", href: "/profile", icon: User },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
