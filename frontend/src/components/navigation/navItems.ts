import { LayoutGrid, PlusCircle } from "lucide-react";

export const NAV_ITEMS = [
  { label: "Home", href: "/", icon: LayoutGrid },
  { label: "Create", href: "/create", icon: PlusCircle },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
