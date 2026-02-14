/**
 * 卡片类型系统模块
 * 
 * 提供卡片类型标记管理和类型映射工具。
 * 
 * @see .kiro/specs/card-type-system-enhancement/
 */

export { CardTypeMarkerService } from './CardTypeMarkerService';
export type { CardTypeMarker } from './CardTypeMarkerService';

export {
  TYPE_MAPPING,
  REVERSE_TYPE_MAPPING,
  getTechnicalType,
  getPossibleMarkers,
  isValidTypeMapping,
  getMarkerDisplayName,
  getMarkerIcon,
  getMarkerDescription,
} from './type-mapping';
