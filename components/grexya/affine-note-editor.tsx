"use client";

/**
 * Editor de hojas AFFiNE (BlockSuite 0.19) embebido en Grexya.
 * El contenido se guarda en notes.body como update de Yjs en base64
 * con prefijo "affine:v1:". Cuerpos legacy (texto plano) se importan
 * como párrafos la primera vez que se abre la nota.
 */
import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { AffineEditorContainer } from "@blocksuite/presets";
import { effects as presetsEffects } from "@blocksuite/presets/effects";
import { effects as blocksEffects } from "@blocksuite/blocks/effects";
import { AffineSchemas } from "@blocksuite/blocks/schemas";
import { DocCollection, Schema, type Doc } from "@blocksuite/store";
import { OverrideThemeExtension } from "@blocksuite/affine-shared/services";
import { ColorScheme } from "@blocksuite/affine-model";
import { signal } from "@preact/signals-core";
import "@toeverything/theme/style.css";
import { darkCssVariablesV2, lightCssVariablesV2 } from "@toeverything/theme/v2";
import type { Note } from "@/lib/types";

export const AFFINE_BODY_PREFIX = "affine:v1:";

let effectsRegistered = false;
function registerEffects() {
  if (effectsRegistered) return;
  effectsRegistered = true;
  blocksEffects();
  presetsEffects();
  injectThemeV2();
  startThemeSync();
}

/**
 * El ThemeObserver por defecto de BlockSuite arranca en "light" y solo
 * reacciona a CAMBIOS posteriores de data-theme — nunca lee el valor
 * inicial. Este signal sí lo lee y se mantiene sincronizado con el tema
 * de la app (next-themes pone data-theme en <html>).
 */
const appTheme$ = signal<ColorScheme>(ColorScheme.Light);
function currentScheme(): ColorScheme {
  return document.documentElement.dataset.theme === "dark"
    ? ColorScheme.Dark
    : ColorScheme.Light;
}
function startThemeSync() {
  appTheme$.value = currentScheme();
  new MutationObserver(() => {
    appTheme$.value = currentScheme();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

/**
 * BlockSuite 0.19 estila con las variables "v2" del tema de AFFiNE
 * (--affine-v2-*), que el paquete solo publica como objetos JS — AFFiNE
 * las inyecta en runtime. Sin esto, el texto del editor queda con los
 * colores por defecto (negro) en dark mode.
 */
function injectThemeV2() {
  if (document.getElementById("affine-theme-v2")) return;
  const block = (vars: Record<string, string>) =>
    Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
  const style = document.createElement("style");
  style.id = "affine-theme-v2";
  style.textContent =
    `:root,[data-theme="light"]{${block(lightCssVariablesV2)}}` +
    `[data-theme="dark"]{${block(darkCssVariablesV2)}}`;
  document.head.appendChild(style);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function buildDoc(note: Note): Doc {
  const schema = new Schema().register(AffineSchemas);
  const collection = new DocCollection({ schema });
  collection.meta.initialize();
  const doc = collection.createDoc({ id: "note" });

  const stored = note.body?.startsWith(AFFINE_BODY_PREFIX)
    ? base64ToBytes(note.body.slice(AFFINE_BODY_PREFIX.length))
    : null;

  if (stored) {
    doc.load(() => Y.applyUpdate(doc.spaceDoc, stored));
    return doc;
  }

  doc.load();
  const pageId = doc.addBlock("affine:page", { title: new doc.Text(note.title ?? "") });
  doc.addBlock("affine:surface", {}, pageId);
  const noteBlockId = doc.addBlock("affine:note", {}, pageId);
  const legacy = (note.body ?? "").trim();
  if (legacy) {
    for (const line of legacy.split(/\n+/)) {
      doc.addBlock("affine:paragraph", { text: new doc.Text(line) }, noteBlockId);
    }
  } else {
    doc.addBlock("affine:paragraph", {}, noteBlockId);
  }
  return doc;
}

export default function AffineNoteEditor({
  note,
  onUpdate,
}: {
  note: Note;
  onUpdate: (id: string, patch: { title?: string; body?: string }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const initialNoteRef = useRef(note);

  useEffect(() => {
    registerEffects();
    const host = hostRef.current;
    if (!host) return;

    const current = initialNoteRef.current;
    const doc = buildDoc(current);
    const editor = new AffineEditorContainer();
    editor.doc = doc;
    editor.mode = "page";
    const themeExt = OverrideThemeExtension({
      getAppTheme: () => appTheme$,
      getEdgelessTheme: () => appTheme$,
    });
    editor.pageSpecs = [...editor.pageSpecs, themeExt];
    editor.edgelessSpecs = [...editor.edgelessSpecs, themeExt];
    host.appendChild(editor);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      const body = AFFINE_BODY_PREFIX + bytesToBase64(Y.encodeStateAsUpdate(doc.spaceDoc));
      const root = doc.root as { title?: { toString(): string } } | null;
      const title = root?.title?.toString() ?? "";
      onUpdateRef.current(current.id, { title, body });
    };
    const onDocUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    };
    doc.spaceDoc.on("update", onDocUpdate);

    return () => {
      clearTimeout(timer);
      doc.spaceDoc.off("update", onDocUpdate);
      editor.remove();
    };
  }, []);

  return <div ref={hostRef} className="affine-host" />;
}
