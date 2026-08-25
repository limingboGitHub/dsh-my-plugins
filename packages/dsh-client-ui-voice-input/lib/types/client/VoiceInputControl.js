import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { startRecording } from "./recorder.js";
import css from './VoiceInputControl.module.css';
/** Recorder failures map onto dictionary keys of the same vocabulary. */
const FAILURE_KEY = {
    denied: 'micDenied',
    unsupported: 'unsupported',
    empty: 'empty',
};
/**
 * Largest base64 payload the host gateway accepts, in characters. Checked here
 * too so an over-long recording fails without spending a round trip.
 */
const MAX_AUDIO_BASE64_LENGTH = 10 * 1024 * 1024;
/**
 * Microphone control for the composer tool row. Recording and WAV encoding
 * happen here; the transcription request and the draft write are injected, so
 * this component holds no ctx and no session lookup.
 */
export function VoiceInputControl({ input, transcribe, appendDraft, t }) {
    const [phase, setPhase] = useState('idle');
    const [error, setError] = useState(null);
    const recordingRef = useRef(null);
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
            // Unmounting mid-recording must not leave the microphone open; a session
            // switch or a collapsed composer both unmount this seat.
            recordingRef.current?.cancel();
            recordingRef.current = null;
        };
    }, []);
    const begin = useCallback(() => {
        setError(null);
        void startRecording().then((started) => {
            if (!aliveRef.current) {
                if ('cancel' in started)
                    started.cancel();
                return;
            }
            if ('kind' in started) {
                setError(t(FAILURE_KEY[started.failure]));
                return;
            }
            recordingRef.current = started;
            setPhase('recording');
        }).catch((reason) => {
            if (!aliveRef.current)
                return;
            setError(reason instanceof Error ? reason.message : String(reason));
        });
    }, [t]);
    const finish = useCallback(() => {
        const recording = recordingRef.current;
        if (recording === null)
            return;
        recordingRef.current = null;
        setPhase('transcribing');
        // One catch for both stages: a stop failure and a transcription rejection
        // reach the user the same way, and a `then` rejection handler would not
        // see a failure thrown inside its own fulfillment callback.
        void recording.stop().then(async (outcome) => {
            if (!aliveRef.current)
                return;
            if (outcome.kind === 'failed') {
                setPhase('idle');
                setError(t(FAILURE_KEY[outcome.failure]));
                return;
            }
            if (outcome.audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
                setPhase('idle');
                setError(t('tooLarge'));
                return;
            }
            const result = await transcribe(outcome.audioBase64);
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- aliveRef.current is mutable; unmount sets it false
            if (!aliveRef.current)
                return;
            setPhase('idle');
            if (result.error !== undefined) {
                setError(result.error);
                return;
            }
            // Empty recognized text is a real provider outcome for a silent
            // recording; appending it would clear nothing but says nothing either.
            if (result.text.length === 0) {
                setError(t('empty'));
                return;
            }
            appendDraft(result.text);
        }).catch((reason) => {
            if (!aliveRef.current)
                return;
            setPhase('idle');
            setError(reason instanceof Error ? reason.message : String(reason));
        });
    }, [appendDraft, t, transcribe]);
    // `phase` here is the composer's own submit state, not this control's: while
    // it is adjudicating or submitting, the draft belongs to that transaction.
    const busy = input.phase === 'adjudicating' || input.phase === 'submitting';
    const label = phase === 'recording' ? t('stop') : phase === 'transcribing' ? t('transcribing') : t('start');
    return (_jsxs("span", { className: css.wrap, children: [_jsx("button", { type: "button", className: phase === 'recording' ? `${css.button} ${css.recording}` : css.button, "aria-label": label, title: label, 
                // A submission in flight owns the draft, so starting a recording that
                // would append to it is refused. An already-running recording still
                // stops, because stopping releases the microphone.
                disabled: phase === 'transcribing' || (phase === 'idle' && busy), onClick: phase === 'recording' ? finish : begin, children: _jsx(MicGlyph, { recording: phase === 'recording' }) }), error !== null && _jsx("span", { className: css.error, role: "status", title: error, children: error })] }));
}
/** Microphone glyph, replaced by a stop square while recording. */
function MicGlyph({ recording }) {
    if (recording) {
        return (_jsx("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": true, focusable: "false", children: _jsx("rect", { x: "3.5", y: "3.5", width: "7", height: "7", rx: "1.5", fill: "currentColor" }) }));
    }
    return (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": true, focusable: "false", children: [_jsx("path", { d: "M7 1.75a1.75 1.75 0 0 1 1.75 1.75v3a1.75 1.75 0 0 1-3.5 0v-3A1.75 1.75 0 0 1 7 1.75Z", fill: "currentColor" }), _jsx("path", { d: "M3.5 6.25v.25a3.5 3.5 0 0 0 7 0v-.25M7 10v2.25M5.25 12.25h3.5", fill: "none", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round" })] }));
}
//# sourceMappingURL=VoiceInputControl.js.map