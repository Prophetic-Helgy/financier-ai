import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function createIco() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = [];

  for (const size of sizes) {
    const buf = await sharp('public/assets/logo.png')
      .resize(size, size)
      .toFormat('png')
      .toBuffer();
    buffers.push(buf);
  }

  // Build ICO: header + directory entries + image data
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // Reserved
  header.writeUInt16LE(1, 2);   // Type: 1 = icon
  header.writeUInt16LE(buffers.length, 4); // Image count

  const dirEntries = Buffer.alloc(buffers.length * 16);
  let imageDataOffset = 6 + buffers.length * 16;

  for (let i = 0; i < buffers.length; i++) {
    const size = sizes[i];
    dirEntries.writeUInt8(size > 255 ? 0 : size, i * 16);           // width
    dirEntries.writeUInt8(size > 255 ? 0 : size, i * 16 + 1);       // height
    dirEntries.writeUInt8(0, i * 16 + 2);                           // color palette
    dirEntries.writeUInt8(0, i * 16 + 3);                           // reserved
    dirEntries.writeUInt16LE(1, i * 16 + 4);                        // color planes
    dirEntries.writeUInt16LE(32, i * 16 + 6);                       // bits per pixel
    dirEntries.writeUInt32LE(buffers[i].length, i * 16 + 8);        // image size
    dirEntries.writeUInt32LE(imageDataOffset, i * 16 + 12);         // offset
    imageDataOffset += buffers[i].length;
  }

  const ico = Buffer.concat([header, dirEntries, ...buffers]);
  fs.writeFileSync('build/icon.ico', ico);
  console.log('icon.ico created successfully');
}

createIco().catch(console.error);