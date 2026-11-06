/**
 * Иконки сайта — набор Hugeicons.
 *
 * Здесь он завёрнут в компоненты с теми же именами и пропсами, какие были у lucide:
 * `<Home size={20} />`, `fill="currentColor"`, `className` и `strokeWidth` работают как раньше.
 * Поэтому разметка страниц не менялась — в каждом файле поменялся только источник импорта.
 *
 * Пути иконок Hugeicons задают только обводку и не задают заливку, поэтому `fill="currentColor"`
 * по-прежнему делает значок сплошным (корона, кнопка «Играть», сердечко в футере).
 *
 * Имя слева — привычное имя lucide, справа — то, что реально отрисуется.
 */
import {
  AddCircleIcon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowTurnBackwardIcon,
  BlockedIcon,
  Bookmark01Icon,
  BookmarkCheck01Icon,
  BookOpen01Icon,
  Camera01Icon,
  CameraOff01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChampionIcon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  ComputerIcon,
  ComputerVideoIcon,
  Copy01Icon,
  CrownIcon,
  DashboardSquare01Icon,
  Delete02Icon,
  DiceIcon,
  DragDropVerticalIcon,
  FavouriteIcon,
  FilterHorizontalIcon,
  Flag01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  GameController01Icon,
  Globe02Icon,
  HelpCircleIcon,
  Home01Icon,
  ImageAdd01Icon,
  InformationCircleIcon,
  KeyboardIcon,
  Layers01Icon,
  Loading03Icon,
  LockIcon,
  Login01Icon,
  Logout01Icon,
  Mail01Icon,
  Maximize01Icon,
  MedalFirstPlaceIcon,
  MedalSecondPlaceIcon,
  MedalThirdPlaceIcon,
  Minimize01Icon,
  MinusSignCircleIcon,
  MinusSignIcon,
  Moon02Icon,
  NextIcon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  PlusSignIcon,
  PuzzleIcon,
  QrCodeIcon,
  RefreshIcon,
  RocketIcon,
  Search01Icon,
  SentIcon,
  Shield01Icon,
  SparklesIcon,
  SquareLock01Icon,
  StarIcon,
  Sun03Icon,
  TargetIcon,
  Tick02Icon,
  UserGroupIcon,
  UserIcon,
  ViewIcon,
  ViewOffIcon,
  WifiConnected02Icon,
  WifiDisconnected02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { forwardRef, type ComponentPropsWithoutRef } from 'react'

export type IconProps = Omit<ComponentPropsWithoutRef<typeof HugeiconsIcon>, 'icon' | 'altIcon' | 'showAlt'>

/** Оборачивает глиф Hugeicons в компонент с API иконки lucide */
function icon(glyph: IconSvgElement, displayName: string) {
  const Component = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <HugeiconsIcon ref={ref} icon={glyph} {...props} />
  ))
  Component.displayName = displayName
  return Component
}

// Навигация и указатели
export const Home = icon(Home01Icon, 'Home')
export const ArrowLeft = icon(ArrowLeft02Icon, 'ArrowLeft')
export const ArrowRight = icon(ArrowRight02Icon, 'ArrowRight')
export const ChevronRight = icon(ArrowRight01Icon, 'ChevronRight')
export const ChevronDown = icon(ArrowDown01Icon, 'ChevronDown')
export const Undo2 = icon(ArrowTurnBackwardIcon, 'Undo2')
export const SkipForward = icon(NextIcon, 'SkipForward')

// Разделы сайта
export const Puzzle = icon(PuzzleIcon, 'Puzzle')
export const Gamepad2 = icon(GameController01Icon, 'Gamepad2')
export const Monitor = icon(ComputerIcon, 'Monitor')
export const MonitorPlay = icon(ComputerVideoIcon, 'MonitorPlay')
export const QrCode = icon(QrCodeIcon, 'QrCode')
export const BookOpen = icon(BookOpen01Icon, 'BookOpen')
export const Info = icon(InformationCircleIcon, 'Info')
export const PlusCircle = icon(AddCircleIcon, 'PlusCircle')

// Действия
export const Plus = icon(PlusSignIcon, 'Plus')
export const Minus = icon(MinusSignIcon, 'Minus')
export const Check = icon(Tick02Icon, 'Check')
export const CheckCircle2 = icon(CheckmarkCircle02Icon, 'CheckCircle2')
export const XCircle = icon(CancelCircleIcon, 'XCircle')
export const MinusCircle = icon(MinusSignCircleIcon, 'MinusCircle')
export const X = icon(Cancel01Icon, 'X')
export const Ban = icon(BlockedIcon, 'Ban')
export const Trash2 = icon(Delete02Icon, 'Trash2')
export const Pencil = icon(PencilEdit02Icon, 'Pencil')
export const Copy = icon(Copy01Icon, 'Copy')
export const Send = icon(SentIcon, 'Send')
export const Search = icon(Search01Icon, 'Search')
export const SlidersHorizontal = icon(FilterHorizontalIcon, 'SlidersHorizontal')
export const RotateCcw = icon(RefreshIcon, 'RotateCcw')
export const GripVertical = icon(DragDropVerticalIcon, 'GripVertical')

// Игра
export const Play = icon(PlayIcon, 'Play')
export const Pause = icon(PauseIcon, 'Pause')
export const Flag = icon(Flag01Icon, 'Flag')
export const Crown = icon(CrownIcon, 'Crown')
export const Trophy = icon(ChampionIcon, 'Trophy')
// Медали пьедестала: в наборе есть отдельные значки под каждое место
export const MedalFirst = icon(MedalFirstPlaceIcon, 'MedalFirst')
export const MedalSecond = icon(MedalSecondPlaceIcon, 'MedalSecond')
export const MedalThird = icon(MedalThirdPlaceIcon, 'MedalThird')
export const Target = icon(TargetIcon, 'Target')
export const Rocket = icon(RocketIcon, 'Rocket')
export const Sparkles = icon(SparklesIcon, 'Sparkles')
export const Star = icon(StarIcon, 'Star')
export const Layers = icon(Layers01Icon, 'Layers')
export const LayoutGrid = icon(DashboardSquare01Icon, 'LayoutGrid')
export const Dice = icon(DiceIcon, 'Dice')
export const ListChecks = icon(CheckListIcon, 'ListChecks')
export const Keyboard = icon(KeyboardIcon, 'Keyboard')
export const Clock = icon(Clock01Icon, 'Clock')
export const Maximize = icon(Maximize01Icon, 'Maximize')
export const Minimize = icon(Minimize01Icon, 'Minimize')

// Вопросы и категории
export const FolderOpen = icon(FolderOpenIcon, 'FolderOpen')
export const FolderPlus = icon(FolderAddIcon, 'FolderPlus')
export const HelpCircle = icon(HelpCircleIcon, 'HelpCircle')
export const ImagePlus = icon(ImageAdd01Icon, 'ImagePlus')

// Аккаунт и доступ
export const User = icon(UserIcon, 'User')
export const Users = icon(UserGroupIcon, 'Users')
export const LogIn = icon(Login01Icon, 'LogIn')
export const LogOut = icon(Logout01Icon, 'LogOut')
export const Mail = icon(Mail01Icon, 'Mail')
export const Lock = icon(LockIcon, 'Lock')
export const LockKeyhole = icon(SquareLock01Icon, 'LockKeyhole')
export const Globe = icon(Globe02Icon, 'Globe')
export const Eye = icon(ViewIcon, 'Eye')
export const EyeOff = icon(ViewOffIcon, 'EyeOff')

// Состояния
export const Loader2 = icon(Loading03Icon, 'Loader2')
export const AlertTriangle = icon(Alert02Icon, 'AlertTriangle')
export const ShieldCheck = icon(Shield01Icon, 'ShieldCheck')
export const Wifi = icon(WifiConnected02Icon, 'Wifi')
export const WifiOff = icon(WifiDisconnected02Icon, 'WifiOff')
export const Camera = icon(Camera01Icon, 'Camera')
export const CameraOff = icon(CameraOff01Icon, 'CameraOff')
export const Heart = icon(FavouriteIcon, 'Heart')
export const Bookmark = icon(Bookmark01Icon, 'Bookmark')
export const BookmarkCheck = icon(BookmarkCheck01Icon, 'BookmarkCheck')

// Тема
export const Sun = icon(Sun03Icon, 'Sun')
export const Moon = icon(Moon02Icon, 'Moon')
