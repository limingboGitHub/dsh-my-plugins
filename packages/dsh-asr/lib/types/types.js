/**
 * ASR capability types: request, result, and error shapes.
 * @module @deepseek-ai/dsh-asr/types
 */
/** ASR provider error. */
export class AsrError extends Error {
    code;
    statusCode;
    /**
     * @param message - Human-readable error description.
     * @param code - Machine-readable error code.
     * @param statusCode - HTTP status code when the error came from an API response.
     */
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'AsrError';
    }
}
//# sourceMappingURL=types.js.map