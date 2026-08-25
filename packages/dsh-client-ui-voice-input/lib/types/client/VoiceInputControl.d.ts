import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { VoiceInputInjected } from './contract.ts';
/** Full voice-seat component props: runtime share & injected share & the locale seat. */
export type VoiceInputControlProps = PropsRuntime<'conversation.input.left'> & InjectFace<VoiceInputInjected> & PropsLocale<'voice'>;
/**
 * Microphone control for the composer tool row. Recording and WAV encoding
 * happen here; the transcription request and the draft write are injected, so
 * this component holds no ctx and no session lookup.
 */
export declare function VoiceInputControl({ input, transcribe, appendDraft, t }: VoiceInputControlProps): import("react").JSX.Element;
//# sourceMappingURL=VoiceInputControl.d.ts.map