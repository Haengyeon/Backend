import { Module } from '@nestjs/common';

import { StoryboardService } from './service/storyboard.service';
import { VideoRenderService } from './service/video-render.service';
import { SceneRendererService } from './service/scene-renderer.service';
import { VideoEncoderService } from './service/video-encoder.service';
import { StorageModule } from '../storage/storage.module';
import {VideoService} from "./service/video.service";
import {VideoScheduler} from "./service/video.scheduler";
import {VideoController} from "./controller/video.controller";

@Module({
    imports: [StorageModule],
    controllers: [VideoController],
    providers: [
        VideoService,
        StoryboardService,
        VideoRenderService,
        SceneRendererService,
        VideoEncoderService,
        VideoScheduler,
    ],
})
export class VideoModule {}