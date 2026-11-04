export function pdfFixture(pageCount = 2) {
  const streams = Array.from(
    { length: pageCount },
    (_, i) =>
      `${i === 0 ? "1 0 0" : "0 0 1"} rg 0 0 200 300 re f 1 g BT /F1 20 Tf 30 150 Td (Page ${i + 1}) Tj ET`,
  );
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${streams.map((_, i) => `${i + 3} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    ...streams.map(
      (_, i) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << /Font << /F1 ${pageCount * 2 + 3} 0 R >> >> /Contents ${pageCount + i + 3} 0 R >>`,
    ),
    ...streams.map(
      (stream) =>
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
