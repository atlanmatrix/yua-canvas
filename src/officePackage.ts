// Resolve OOXML relationships inside the package. External targets are never fetched.
import { strFromU8, strToU8, type Unzipped } from "fflate";

export function officeXml(parts: Unzipped, path: string) {
  if (!parts[path]) throw Error("Missing Office part");
  const doc = new DOMParser().parseFromString(
    strFromU8(parts[path]),
    "application/xml",
  );
  if (doc.querySelector("parsererror")) throw Error("Invalid Office XML");
  return doc;
}

export function officeRelations(parts: Unzipped, path: string) {
  const slash = path.lastIndexOf("/") + 1;
  const rels = path.slice(0, slash) + "_rels/" + path.slice(slash) + ".rels";
  if (!parts[rels]) return [];
  const doc = officeXml(parts, rels);
  return Array.from(doc.getElementsByTagNameNS("*", "Relationship")).flatMap(
    (rel) => {
      const target = rel.getAttribute("Target");
      if (!target || rel.getAttribute("TargetMode") === "External") return [];
      const url = new URL(target, "https://package.invalid/" + path);
      if (url.origin !== "https://package.invalid") return [];
      return [
        {
          id: rel.getAttribute("Id"),
          type: rel.getAttribute("Type"),
          path: decodeURIComponent(url.pathname.slice(1)),
        },
      ];
    },
  );
}

export function officeMainPart(parts: Unzipped) {
  const main = officeRelations(parts, "").find((r) =>
    r.type?.endsWith("/officeDocument"),
  );
  if (!main) throw Error("Missing Office document");
  return main.path;
}

export function serializeOfficeXml(doc: Document) {
  return strToU8(new XMLSerializer().serializeToString(doc));
}
