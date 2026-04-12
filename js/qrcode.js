// QR code generation utility (wrapper for QRious)
// This will use QRious (https://github.com/neocotic/qrious) or similar
// Usage: generateQRCode(data, size) => returns data URL

function generateQRCode(data, size = 128) {
    if (typeof QRious === 'undefined') {
        throw new Error('QRious library not loaded');
    }
    var qr = new QRious({
        value: data,
        size: size,
        level: 'M',
        background: 'white',
        foreground: 'black'
    });
    return qr.toDataURL();
}
