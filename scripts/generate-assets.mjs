import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const faviconSvg = readFileSync(new URL("../public/favicon.svg", import.meta.url));
const ogSvg = readFileSync(new URL("../public/og.svg", import.meta.url));

await sharp(faviconSvg)
  .resize(32, 32)
  .toFormat("png")
  .toBuffer()
  .then((png) => writeFileSync(new URL("../public/favicon.ico", import.meta.url), png));

await sharp(ogSvg)
  .resize(1200, 630)
  .png()
  .toFile(new URL("../public/og.png", import.meta.url).pathname);

console.log("✓ generated public/favicon.ico and public/og.png");
