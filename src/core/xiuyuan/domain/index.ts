/**
 * Xiuyuan Domain Layer
 * 
 * @description
 * 导出所有 Xiuyuan 领域层的组件。
 */

// Value Objects
export { XiuyuanId } from './XiuyuanId';
export { CardId } from './CardId';
export { BlockId } from './BlockId';
export { TemplateId } from './TemplateId';
export { CardFace } from './CardFace';
export type { CardFaceProps } from './CardFace';
export { Priority } from './Priority';
export { ScheduleInfo } from './ScheduleInfo';
export type { ScheduleInfoProps } from './ScheduleInfo';

// Entities
export { Card } from './Card';
export type { CardProps } from './Card';

// Aggregate Root
export { Xiuyuan } from './Xiuyuan';
export type { CreateXiuyuanProps, XiuyuanProps } from './Xiuyuan';

// Domain Events
export * from './events';

// Repository Interfaces
export type { IXiuyuanRepository } from './repositories';

// Domain Services
export { CardCreationService, CardDeletionService } from './services';
