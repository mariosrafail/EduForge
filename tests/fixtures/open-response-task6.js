import sharp from "sharp";

export function task6PublisherXml({ ebook = false, forbidden = "", referencedImage = "image_1" } = {}) {
  const prompts = [1, 2, 3].map((number) => `<text x="30" y="${70 + number * 100}" width="500" height="28" name="prompt_${number}" fontName="Fira Sans" fontSize="21" fontColor="0" align="left"><![CDATA[<b>${number}</b> Imported question ${number}?]]></text>`).join("");
  const lines = [1, 2, 3].map((number) => [0, 1].map((line) => `<text x="50" y="${100 + number * 100 + line * 24}" width="500" height="24" name="line_${number}_${line + 1}" fontName="Myriad Pro" fontSize="21" fontColor="0" align="left"><![CDATA[________________________________________]]></text>`).join("")).join("");
  const sentences = [1, 2, 3].map((number) => `<sentence id="${number}"><text x="50" y="${100 + number * 100}" width="500" height="48" name="answer_${number}" fontName="ITC Flora Std Medium" fontSize="21" fontColor="14942339" align="left" wordWrap="true" vAlign="top"${ebook ? ' maxLines="2" multiline="true"' : ""}><![CDATA[Imported model ${number}.1${ebook ? " " : "<br>"}Imported model ${number}.2]]></text></sentence>`).join("");
  return `${forbidden}<params><navigator viewport="0,0,640,480"/><images><image x="20" y="20" name="${referencedImage}" scale="1" textureName="${referencedImage}"/></images><texts>${prompts}${lines}</texts><exercises><exercise type="write"><sentences>${sentences}</sentences></exercise></exercises></params>`;
}

export async function task6SourceBundle(options = {}) {
  const raster = await sharp({ create: { width: 30, height: 20, channels: 4, background: "#2f6db2" } }).png().toBuffer();
  return [
    { name: "obj_params.xml", bytes: Buffer.from(task6PublisherXml(options.primary)) },
    { name: "ebook_obj_params.xml", bytes: Buffer.from(task6PublisherXml({ ebook: true, ...options.ebook })) },
    { name: "image_1.png", bytes: raster },
  ];
}
