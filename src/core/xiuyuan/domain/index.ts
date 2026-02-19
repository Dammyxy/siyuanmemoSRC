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
export { CardFace, CardFaceProps } from './CardFace';
export { Priority } from './Priority';
export { ScheduleInfo, ScheduleInfoProps } from './ScheduleInfo';

// Entities
export { Card, CardProps } from './Card';

// Aggregate Root
export { Xiuyuan, CreateXiuyuanProps, XiuyuanProps } from './Xiuyuan';

// Domain Events
export * from './events';

// Repository Interfaces
export { IXiuyuanRepository } from './repositories';

// Domain Services
export { CardCreationService, CardDeletionService } from './services';
