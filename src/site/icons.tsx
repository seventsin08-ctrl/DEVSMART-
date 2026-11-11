import {
  BadgeCheck, Building2, CalendarCheck, Clock, Code2, Gauge, Gift, Globe, Headphones, HeartHandshake, Layers,
  LineChart, Lock, MessageCircle, MonitorSmartphone, Palette, PenTool, Rocket, Search, ShieldCheck, ShoppingBag,
  Smartphone, Sparkles, Star, TabletSmartphone, ThumbsUp, User, Wallet, Wrench, Zap, type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@shared/site/schema';

const ICONS: Record<IconName, LucideIcon> = {
  Globe, User, Building2, ShoppingBag, CalendarCheck, Smartphone, TabletSmartphone, Sparkles, Zap, ShieldCheck,
  Wallet, Clock, HeartHandshake, Rocket, Code2, Palette, MessageCircle, Headphones, BadgeCheck, Layers, Gauge,
  Lock, Star, ThumbsUp, Wrench, LineChart, Search, PenTool, MonitorSmartphone, Gift,
};

/** Renders an icon from the allowlist only (names come from validated site data / the services table). */
export function SiteIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name as IconName] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
