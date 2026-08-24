import { PartialType } from '@nestjs/mapped-types';
import { CreateMatchingDto } from './create-matching.dto';

export class UpdateMatchingDto extends PartialType(CreateMatchingDto) {}
