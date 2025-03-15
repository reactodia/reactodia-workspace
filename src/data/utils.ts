/** Generates random 32-digit hexadecimal string. */
export function generate128BitID() {
    function random32BitDigits() {
        return Math.floor((1 + Math.random()) * 0x100000000)
            .toString(16).substring(1);
    }
    // generate by half because of restricted numerical precision
    return random32BitDigits() + random32BitDigits() + random32BitDigits() + random32BitDigits();
}
