/**
 * MiMo wire types. Only the fields this provider reads are modeled; the
 * vendor's response carries more.
 * @module dsh-asr-mimo/types
 */

/** The vendor's chat-completion response, as far as recognition needs it. */
export interface MimoResponse {
  /** Completion choices; recognition reads the first one's message content. */
  choices?: readonly {
    message?: {
      /** The recognized text. */
      content?: string
    }
  }[]
  /** Usage report; carries the audio duration the vendor billed. */
  usage?: {
    /** Audio duration in seconds. */
    seconds?: number
  }
}
