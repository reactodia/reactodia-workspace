/*!
 * SHA-256 implementation adopted from https://github.com/brillout/forge-sha256
 *
 * Commit: 6ad5535e0be2385fdc53f1d9ce2b172365c70333
 * Date: Jul 5, 2017
 */

/*!
The MIT License (MIT)

Copyright (c) 2015-2017 Romuald Brillout and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { CircularBuffer } from './circularBuffer';

export class Sha256 {
    private initialized = false;
    // sha-256 padding bytes not initialized yet
    private _padding!: Uint8Array;
    // table of constants
    private _k!: Uint32Array;

    /**
     * Initializes the constant tables.
     */
    private initialize() {
        if (this.initialized) {
            return;
        }

        // create padding
        this._padding = new Uint8Array(64);
        this._padding[0] = 1 << 7;
    
        // create K table for SHA-256
        this._k = new Uint32Array([
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
            0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
            0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
            0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
            0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
            0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
            0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
            0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        ]);
    
        // now initialized
        this.initialized = true;
    }

    /**
     * Creates a SHA-256 message digest object.
     *
     * @return a message digest object.
     */
    create(): Sha256Digest {
        // do initialization as necessary
        this.initialize();

        // message digest object
        return new Sha256Digest(this._padding, this._k);
    }
}

export interface HashDigest {
    start(): void;
    update(bytes: Uint8Array): void;
    digest(): Uint8Array;
}

class Sha256Digest implements HashDigest {
    readonly blockLength = 64;
    readonly digestLength = 32;

    // 56-bit length of message so far (does not including padding)
    private messageLength = 0;
    // true 64-bit message length as two 32-bit ints
    private messageLength64: [number, number] = [0, 0];

    // SHA-256 state contains eight 32-bit integers
    private _state!: Sha256State;
    // input buffer
    private _input!: CircularBuffer;
    // used for word storage
    private _w = Array.from({length: 64}, () => 0);

    constructor(
        private readonly _padding: Uint8Array,
        private readonly _k: Uint32Array
    ) {
        // start digest automatically for first time
        this.start();
    }

    /**
     * Starts the digest.
     */
    start() {
        this.messageLength = 0;
        this.messageLength64 = [0, 0];
        this._input = new CircularBuffer();
        this._state = {
            h0: 0x6A09E667,
            h1: 0xBB67AE85,
            h2: 0x3C6EF372,
            h3: 0xA54FF53A,
            h4: 0x510E527F,
            h5: 0x9B05688C,
            h6: 0x1F83D9AB,
            h7: 0x5BE0CD19,
        };
    }

    /**
     * Updates the digest with the given message input.
     *
     * @param bytes the binary data to update with.
     */
    update(bytes: Uint8Array): void {
        // update message length
        this.messageLength += bytes.length;
        this.messageLength64[0] += (bytes.length / 0x100000000) >>> 0;
        this.messageLength64[1] += bytes.length >>> 0;

        // add bytes to input buffer
        this._input.writeBytes(bytes);

        // process bytes
        _update(this._state, this._w, this._input, this._k);
    }

    /**
     * Produces the digest.
     *
     * @return a byte buffer containing the digest value.
     */
    digest(): Uint8Array {
        // Note: Here we copy the remaining bytes in the input buffer and
        // add the appropriate SHA-256 padding. Then we do the final update
        // on a copy of the state so that if the user wants to get
        // intermediate digests they can do so.

        // Determine the number of bytes that must be added to the message
        // to ensure its length is congruent to 448 mod 512. In other words,
        // the data to be digested must be a multiple of 512 bits (or 128 bytes).
        // This data includes the message, some padding, and the length of the
        // message. Since the length of the message will be encoded as 8 bytes (64
        // bits), that means that the last segment of the data must have 56 bytes
        // (448 bits) of message and padding. Therefore, the length of the message
        // plus the padding must be congruent to 448 mod 512 because
        // 512 - 128 = 448.
    
        // In order to fill up the message length it must be filled with
        // padding that begins with 1 bit followed by all 0 bits. Padding
        // must *always* be present, so if the message length is already
        // congruent to 448 mod 512, then 512 padding bits must be added.

        // 512 bits == 64 bytes, 448 bits == 56 bytes, 64 bits = 8 bytes
        // _padding starts with 1 byte with first bit is set in it which
        // is byte value 128, then there may be up to 63 other pad bytes
        const padBytes = new CircularBuffer();
        padBytes.ensureFreeCapacity(this._input.length);
        for (const span of this._input.peekBytes()) {
            padBytes.writeBytes(span);
        }
        // 64 - (remaining msg + 8 bytes msg length) mod 64
        padBytes.writeBytes(this._padding, 64 - ((this.messageLength64[1] + 8) & 0x3F));

        // Now append length of the message. The length is appended in bits
        // as a 64-bit number in big-endian order. Since we store the length in
        // bytes, we must multiply the 64-bit length by 8 (or left shift by 3).
        padBytes.writeInt32(
            (this.messageLength64[0] << 3) | (this.messageLength64[0] >>> 28)
        );
        padBytes.writeInt32(this.messageLength64[1] << 3);
        const s2: Sha256State = {...this._state};
        _update(s2, this._w, padBytes, this._k);
        const result = new CircularBuffer(this.digestLength);
        result.writeInt32(s2.h0);
        result.writeInt32(s2.h1);
        result.writeInt32(s2.h2);
        result.writeInt32(s2.h3);
        result.writeInt32(s2.h4);
        result.writeInt32(s2.h5);
        result.writeInt32(s2.h6);
        result.writeInt32(s2.h7);
        return result.readBytes(result.length);
    }
}

interface Sha256State {
    h0: number,
    h1: number,
    h2: number,
    h3: number,
    h4: number,
    h5: number,
    h6: number,
    h7: number,
}

/**
 * Updates a SHA-256 state with the given byte buffer.
 *
 * @param s the SHA-256 state to update.
 * @param w the array to use to store words.
 * @param bytes the byte buffer to update with.
 * @param _k SHA-256 coefficients (readonly)
 */
function _update(s: Sha256State, w: number[], bytes: CircularBuffer, _k: Uint32Array) {
    // consume 512 bit (64 byte) chunks
    let t1: number, t2: number, s0: number, s1: number, ch: number, maj: number, i: number,
        a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
    let len = bytes.length;
    while (len >= 64) {
        // the w array will be populated with sixteen 32-bit big-endian words
        // and then extended into 64 32-bit words according to SHA-256
        for (i = 0; i < 16; ++i) {
            w[i] = bytes.readInt32();
        }
        for (; i < 64; ++i) {
            // XOR word 2 words ago rot right 17, rot right 19, shft right 10
            t1 = w[i - 2];
            t1 =
                ((t1 >>> 17) | (t1 << 15)) ^
                ((t1 >>> 19) | (t1 << 13)) ^
                (t1 >>> 10);
            // XOR word 15 words ago rot right 7, rot right 18, shft right 3
            t2 = w[i - 15];
            t2 =
                ((t2 >>> 7) | (t2 << 25)) ^
                ((t2 >>> 18) | (t2 << 14)) ^
                (t2 >>> 3);
            // sum(t1, word 7 ago, t2, word 16 ago) modulo 2^32
            w[i] = (t1 + w[i - 7] + t2 + w[i - 16]) | 0;
        }

        // initialize hash value for this chunk
        a = s.h0;
        b = s.h1;
        c = s.h2;
        d = s.h3;
        e = s.h4;
        f = s.h5;
        g = s.h6;
        h = s.h7;

        // round function
        for (i = 0; i < 64; ++i) {
            // Sum1(e)
            s1 =
                ((e >>> 6) | (e << 26)) ^
                ((e >>> 11) | (e << 21)) ^
                ((e >>> 25) | (e << 7));
            // Ch(e, f, g) (optimized the same way as SHA-1)
            ch = g ^ (e & (f ^ g));
            // Sum0(a)
            s0 =
                ((a >>> 2) | (a << 30)) ^
                ((a >>> 13) | (a << 19)) ^
                ((a >>> 22) | (a << 10));
            // Maj(a, b, c) (optimized the same way as SHA-1)
            maj = (a & b) | (c & (a ^ b));

            // main algorithm
            t1 = h + s1 + ch + _k[i] + w[i];
            t2 = s0 + maj;
            h = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }

        // update hash state
        s.h0 = (s.h0 + a) | 0;
        s.h1 = (s.h1 + b) | 0;
        s.h2 = (s.h2 + c) | 0;
        s.h3 = (s.h3 + d) | 0;
        s.h4 = (s.h4 + e) | 0;
        s.h5 = (s.h5 + f) | 0;
        s.h6 = (s.h6 + g) | 0;
        s.h7 = (s.h7 + h) | 0;
        len -= 64;
    }
}
