/**
 * Messages about what a `resource <Parent>.<Child>` names: an infra leaf, a
 * client's storage (#3794), or nothing, and how the detail panel shows a
 * client's storages. Kept apart from `types.ts` / `en.ts` /
 * `ja.ts` for the same line-budget reason as `first-run.ts`, and joined with it
 * in `catalog-parts.ts`.
 */

export type PhysicalRefTranslations = {
  "diagnostic.unresolvedResourceRef.message": (params: {
    infraId: string;
    subId: string;
    missing: "block" | "leaf";
    parentKind?: "infra" | "client";
  }) => string;
  "diagnostic.resourceTargetAmbiguous.infraAndClient": (params: {
    ref: string;
    parent: string;
  }) => string;
  "diagnostic.resourceTargetAmbiguous.multipleClients": (params: {
    ref: string;
    parent: string;
    child: string;
  }) => string;
  "warning.clientResourceDuplicateId.message": (params: { clientId: string; id: string }) => string;
  "nodeDetail.resources.usedBy": (params: { usecases: string }) => string;
  "nodeDetail.clientStorage.title": string;
  "nodeDetail.clientStorage.value": (params: {
    clientId: string;
    storageKind: string;
    name: string;
  }) => string;
};

export const physicalRefsEn: PhysicalRefTranslations = {
  "diagnostic.unresolvedResourceRef.message": ({ infraId, subId, missing, parentKind }) =>
    missing === "block"
      ? `"resource ${infraId}.${subId}" references "${infraId}", which no database / queue / storage block or client declares`
      : parentKind === "client"
        ? `"resource ${infraId}.${subId}" references "${subId}", but client "${infraId}" declares no storage resource with that id`
        : `"resource ${infraId}.${subId}" references "${subId}", which "${infraId}" does not declare`,
  "diagnostic.resourceTargetAmbiguous.infraAndClient": ({ ref, parent }) =>
    `"resource ${ref}": "${parent}" is both an infra block and a client. The reference resolves to the infra block, and the client's storage resources cannot be referenced; rename one of them`,
  "diagnostic.resourceTargetAmbiguous.multipleClients": ({ ref, parent, child }) =>
    `"resource ${ref}": more than one client "${parent}" declares a storage resource "${child}", so the reference does not resolve; give one of them another id`,
  "warning.clientResourceDuplicateId.message": ({ clientId, id }) =>
    `client "${clientId}" declares more than one storage resource with id "${id}"; "resource ${clientId}.${id}" resolves to the first`,
  "nodeDetail.resources.usedBy": ({ usecases }) => `used by ${usecases}`,
  "nodeDetail.clientStorage.title": "📦 Client storage",
  "nodeDetail.clientStorage.value": ({ clientId, storageKind, name }) =>
    `${storageKind} "${name}" of client ${clientId}`,
};

export const physicalRefsJa: PhysicalRefTranslations = {
  "diagnostic.unresolvedResourceRef.message": ({ infraId, subId, missing, parentKind }) =>
    missing === "block"
      ? `"resource ${infraId}.${subId}" が参照する "${infraId}" を宣言する database / queue / storage ブロックも client もありません`
      : parentKind === "client"
        ? `"resource ${infraId}.${subId}" が参照する "${subId}" を id に持つ storage resource は client "${infraId}" にありません`
        : `"resource ${infraId}.${subId}" が参照する "${subId}" は "${infraId}" に宣言されていません`,
  "diagnostic.resourceTargetAmbiguous.infraAndClient": ({ ref, parent }) =>
    `"resource ${ref}": "${parent}" は infra ブロックと client の両方の id です。参照は infra ブロックに解決し、client の storage resource は参照できません。どちらかの id を変えてください`,
  "diagnostic.resourceTargetAmbiguous.multipleClients": ({ ref, parent, child }) =>
    `"resource ${ref}": storage resource "${child}" を宣言する client "${parent}" が複数あるため、参照は解決しません。どちらかの id を変えてください`,
  "warning.clientResourceDuplicateId.message": ({ clientId, id }) =>
    `client "${clientId}" に id "${id}" の storage resource が複数あります。"resource ${clientId}.${id}" は最初のものに解決します`,
  "nodeDetail.resources.usedBy": ({ usecases }) => `参照する usecase: ${usecases}`,
  "nodeDetail.clientStorage.title": "📦 client の storage",
  "nodeDetail.clientStorage.value": ({ clientId, storageKind, name }) =>
    `client ${clientId} の ${storageKind} "${name}"`,
};
