/**
 * ASR (Automatic Speech Recognition) Service Definition. Providers register
 * under `ctx.asr`, and consumers resolve one provider to transcribe audio
 * into text. The capability seam separates abstract operations from
 * provider-specific API clients.
 * @module @deepseek-ai/dsh-asr
 */
import { Service } from '@deepseek-ai/cordis';
export { AsrError } from "./types.js";
/**
 * ASR provider abstract service. Implementations register under the `asr`
 * service name and supply a `transcribe` method that converts audio to text.
 */
export class AsrProvider extends Service {
    constructor(ctx) {
        super(ctx, 'asr');
    }
}
export default AsrProvider;
//# sourceMappingURL=index.js.map