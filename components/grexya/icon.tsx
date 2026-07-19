import {
  PanelLeft, Layers, Target, Columns3, List, FileText, Check, Calendar,
  ChevronDown, ChevronLeft, ChevronRight, Plus, Sun, Moon, Settings, Users,
  MoreVertical, MoreHorizontal, ArrowLeft, Flag, LayoutGrid, X, Eye, EyeOff,
  Clock, Zap, Sparkles, Paperclip, Send, Bold, Italic, Heading1, Quote,
  Star, AlertTriangle, Trash2, Pencil, Upload, Image as ImageIcon, GripVertical,
  Repeat, Maximize2, Minimize2, Shapes,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  sidebar: PanelLeft, layers: Layers, target: Target, columns: Columns3,
  list: List, fileText: FileText, check: Check, calendar: Calendar,
  chevDown: ChevronDown, chevLeft: ChevronLeft, chevRight: ChevronRight,
  plus: Plus, sun: Sun, moon: Moon, settings: Settings, users: Users,
  more: MoreVertical, moreH: MoreHorizontal, arrowLeft: ArrowLeft, flag: Flag,
  grid: LayoutGrid, x: X, eye: Eye, eyeOff: EyeOff, clock: Clock, zap: Zap,
  sparkles: Sparkles, paperclip: Paperclip, send: Send, bold: Bold,
  italic: Italic, h1: Heading1, quote: Quote, star: Star, warn: AlertTriangle,
  trash: Trash2, pencil: Pencil, upload: Upload, image: ImageIcon, grip: GripVertical,
  repeat: Repeat, maximize: Maximize2, minimize: Minimize2, shapes: Shapes,
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.9,
  className,
  style,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const C = MAP[name] ?? Layers;
  return <C size={size} strokeWidth={strokeWidth} className={className} style={style} />;
}
