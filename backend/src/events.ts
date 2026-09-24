/**
 * events.ts
 * Global EventEmitter singleton for broadcasting pipeline progress events.
 *
 * The SSE endpoint (task 10.4) subscribes to this emitter per kit ID so it can
 * forward `StageEvent` objects to the connected client in real time.
 *
 * Each pipeline run emits on a channel keyed by the kit's string ID:
 *
 *   pipelineEmitter.emit(kitId, event: StageEvent)
 *
 * The SSE endpoint adds a listener for the kit's ID channel when a client
 * connects and removes it on disconnect or pipeline completion.
 */

import { EventEmitter } from 'events';
import type { StageEvent } from './services/extractionPipeline';

/**
 * Singleton EventEmitter used across the entire backend process.
 *
 * `setMaxListeners(0)` disables the default warning that fires when more than
 * 10 listeners are attached to the same event — a common occurrence when many
 * clients connect to the same kit's SSE stream simultaneously.
 */
class PipelineEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }

  /**
   * Emit a pipeline stage event for a specific kit.
   *
   * @param kitId  The MongoDB ObjectId string of the kit being processed.
   * @param event  The `StageEvent` to broadcast to all connected SSE clients.
   */
  emitStage(kitId: string, event: StageEvent): void {
    this.emit(kitId, event);
  }

  /**
   * Subscribe to stage events for a specific kit.
   *
   * @param kitId    The MongoDB ObjectId string of the kit being watched.
   * @param listener Callback invoked for every `StageEvent` emitted for this kit.
   */
  onStage(kitId: string, listener: (event: StageEvent) => void): void {
    this.on(kitId, listener);
  }

  /**
   * Unsubscribe a listener from a specific kit's stage events.
   *
   * @param kitId    The kit's ObjectId string.
   * @param listener The exact listener function reference to remove.
   */
  offStage(kitId: string, listener: (event: StageEvent) => void): void {
    this.off(kitId, listener);
  }
}

export const pipelineEmitter = new PipelineEventEmitter();
