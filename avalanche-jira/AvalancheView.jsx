/* avalanche-jira bundled view — ESM single file; host provides React */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";


/* --- constants.js --- */
/** Mirrors avalanche/config.py — keep in sync when changing Jira field sets. */

const EXTENSION_ID = "avalanche-jira";

/**
 * Narrow field list (optional). Default issue fetch uses FETCH_ISSUE_FIELDS_ALL so every
 * project field (Sundance + custom) is returned from Jira.
 */
const FETCH_FIELDS = [
  "summary",
  "description",
  "issuetype",
  "status",
  "project",
  "priority",
  "assignee",
  "reporter",
  "creator",
  "created",
  "updated",
  "labels",
  "components",
  "environment",
  "attachment",
  "comment",
  "parent",
  "subtasks",
  "resolution",
  "customfield_10014",
  "customfield_10011",
  "issuelinks",
  "customfield_10020",
  "fixVersions",
  "timeoriginalestimate",
  "timeestimate",
];

/** Jira REST: request all navigable fields (custom + system) for each issue. */
const FETCH_ISSUE_FIELDS_ALL = "*all";

const HEADERS = [
  "Summary",
  "Description",
  "Description ADF",
  "Issue key",
  "Issue id",
  "Issue Type",
  "Status",
  "Project key",
  "Project name",
  "Components",
  "Labels",
  "Priority",
  "Assignee",
  "Reporter",
  "Creator",
  "Created",
  "Updated",
  "Environment",
  "Attachment",
  "Comment",
  "Epic Link",
  "Epic Name",
  "Epic Children",
  "Issue Links",
  "Parent",
  "Parent key",
  "Parent summary",
  "Status Category",
  "Variables",
  "Sprint",
  "Fix Version",
  "Original Estimate",
  "Remaining Estimate",
  "Resolution",
  "Subtasks",
  "Jira fields (extra)",
];

const DEFAULT_KANBAN_COLUMNS = [
  { name: "To Do", statuses: ["To Do", "Open", "Backlog", "New"] },
  { name: "In Progress", statuses: ["In Progress", "In Review", "In Development"] },
  { name: "Done", statuses: ["Done", "Closed", "Resolved", "Complete", "Completed"] },
];

const STORAGE_KEY = "avalanche-jira/v1/blob";


/* --- adfText.js --- */
/** Extract plain text from Jira Atlassian Document Format (minimal walker). */

function extractTextFromAdf(node) {
  const out = [];
  function walk(n) {
    if (n == null) return;
    if (typeof n === "string") {
      out.push(n);
      return;
    }
    if (typeof n !== "object") return;
    const t = n.type;
    if (t === "text" && "text" in n) {
      out.push(n.text || "");
    } else if (t === "mention") {
      out.push((n.attrs && n.attrs.text) || "");
    } else if (t === "emoji") {
      out.push((n.attrs && (n.attrs.text || n.attrs.shortName)) || "");
    } else if (t === "status") {
      out.push((n.attrs && n.attrs.text) || "");
    } else if (t === "date") {
      out.push((n.attrs && n.attrs.timestamp) || "");
    } else if (t === "hardBreak") {
      out.push("\n");
    } else {
      if (n.content && Array.isArray(n.content)) {
        for (const c of n.content) walk(c);
      }
      for (const k of Object.keys(n)) {
        if (k === "content") continue;
        const v = n[k];
        if (Array.isArray(v)) {
          for (const c of v) walk(c);
        } else if (v && typeof v === "object") walk(v);
      }
    }
  }
  walk(node);
  return out
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Strip ADF node types that Jira rejects when sent back via PUT /issue.
 * Media (attachments/images), smart cards, and interactive content (tasks, decisions)
 * all produce INVALID_INPUT on update. Mentions, emoji, date, and status are
 * converted to plain text so their content is preserved as readable text.
 */
function sanitizeAdfForUpdate(adf) {
  if (!adf || typeof adf !== "object") return null;
  const PASSTHROUGH = new Set([
    "doc", "paragraph", "text", "hardBreak", "rule",
    "heading", "blockquote", "codeBlock",
    "bulletList", "orderedList", "listItem",
    "table", "tableRow", "tableHeader", "tableCell",
    "panel", "expand", "nestedExpand",
  ]);

  function san(node) {
    if (!node || typeof node !== "object" || !node.type) return null;

    if (node.type === "mention") {
      const name = (node.attrs && (node.attrs.text || node.attrs.displayName)) || "@mention";
      return { type: "text", text: name };
    }
    if (node.type === "emoji") {
      return { type: "text", text: (node.attrs && node.attrs.text) || "" };
    }
    if (node.type === "status") {
      return { type: "text", text: (node.attrs && node.attrs.text) || "" };
    }
    if (node.type === "date") {
      const ts = node.attrs && node.attrs.timestamp;
      return { type: "text", text: ts ? new Date(Number(ts)).toLocaleDateString() : "" };
    }
    if (node.type === "taskList" || node.type === "decisionList") {
      const kids = (node.content || []).map(san).filter(Boolean);
      return kids.length ? { type: "bulletList", content: kids } : null;
    }
    if (node.type === "taskItem" || node.type === "decisionItem") {
      const kids = (node.content || []).map(san).filter(Boolean);
      return { type: "listItem", content: kids.length ? kids : [{ type: "paragraph", content: [] }] };
    }

    if (!PASSTHROUGH.has(node.type)) return null; // drop media, cards, etc.

    const out = { type: node.type };
    // ADF root node requires version; preserve it so the payload is valid.
    if (node.type === "doc") out.version = node.version || 1;
    if (node.attrs) out.attrs = node.attrs;
    if (node.text !== undefined) out.text = node.text;
    if (Array.isArray(node.marks) && node.marks.length) {
      out.marks = node.marks.filter((m) => m && m.type);
    }
    if (Array.isArray(node.content)) {
      const kids = node.content.map(san).filter(Boolean);
      if ((node.type === "paragraph" || node.type === "listItem") && kids.length === 0) {
        return null; // skip empty structural nodes — some Jira configs reject them
      }
      out.content = kids;
    }
    return out;
  }

  const result = san(adf);
  if (!result || !Array.isArray(result.content) || result.content.length === 0) return null;
  return result;
}

function textToAdf(text) {
  if (text == null) return { type: "doc", version: 1, content: [] };
  let t = String(text);
  if (t.endsWith("\n")) t = t.slice(0, -1);
  if (!t) return { type: "doc", version: 1, content: [] };
  const lines = t.split("\n");
  const content = [];
  for (const line of lines) {
    if (line === "") content.push({ type: "paragraph", content: [] });
    else {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: line }],
      });
    }
  }
  return { type: "doc", version: 1, content };
}


/* --- adfHtml.js --- */
/**
 * ADF <-> HTML bidirectional converter for the inline rich text editor.
 * adfToHtml: renders ADF JSON into styled HTML for contentEditable display.
 * htmlToAdf: converts contentEditable HTML back to ADF JSON via DOMParser.
 *
 * Inline styles match the original Avalanche Python app's _convert_adf_to_html
 * (desc_mixin.py) so descriptions look 1:1 with Jira.
 */

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var TABLE_STYLE = 'border-collapse:collapse;width:100%;margin:8px 0 16px 0';
var CELL_STYLE = 'border:1px solid var(--hp-border,#555);padding:8px 10px;min-height:44px;vertical-align:top';
var TH_STYLE = CELL_STYLE + ';background:rgba(211,166,37,0.15);font-weight:bold';

function marksToHtml(text, marks) {
  var html = esc(text);
  if (!marks || !Array.isArray(marks)) return html;
  for (var i = 0; i < marks.length; i++) {
    var m = marks[i];
    var t = m.type;
    if (t === "strong") html = '<strong>' + html + '</strong>';
    else if (t === "em") html = '<em>' + html + '</em>';
    else if (t === "code") html = '<code style="background:rgba(0,0,0,0.1);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.9em">' + html + '</code>';
    else if (t === "underline") html = '<u>' + html + '</u>';
    else if (t === "strike") html = '<s>' + html + '</s>';
    else if (t === "link" && m.attrs && m.attrs.href) {
      html = '<a href="' + esc(m.attrs.href) + '" target="_blank" rel="noopener" style="color:var(--hp-accent,#4a9eff);text-decoration:underline">' + html + '</a>';
    }
    else if (t === "textColor" && m.attrs && m.attrs.color) {
      html = '<span style="color:' + esc(m.attrs.color) + '">' + html + '</span>';
    }
    else if (t === "subsup" && m.attrs) {
      var tag = m.attrs.type === "sup" ? "sup" : "sub";
      html = '<' + tag + '>' + html + '</' + tag + '>';
    }
  }
  return html;
}

function nodeToHtml(node) {
  if (!node || typeof node !== "object") return "";
  var t = node.type;
  var attrs = node.attrs || {};
  var children = (node.content || []).map(nodeToHtml).join("");

  if (t === "doc") return children;

  if (t === "text") return marksToHtml(node.text || "", node.marks);

  if (t === "paragraph") {
    var inner = children;
    if (!inner || !inner.trim()) {
      return '<p style="margin:4px 0;min-height:1.5em">&nbsp;</p>';
    }
    return '<p style="margin:4px 0">' + inner + '</p>';
  }

  if (t === "heading") {
    var lvl = Math.min(Math.max(attrs.level || 1, 1), 6);
    return '<h' + lvl + ' style="margin:8px 0 4px 0">' + children + '</h' + lvl + '>';
  }

  if (t === "bulletList") {
    var items = "";
    var listContent = node.content || [];
    for (var i = 0; i < listContent.length; i++) {
      var li = listContent[i];
      var liInner = (li.content || []).map(nodeToHtml).join("");
      items += '<li style="margin:2px 0">' + liInner + '</li>';
    }
    return '<ul style="margin:4px 0;padding-left:20px">' + items + '</ul>';
  }

  if (t === "orderedList") {
    var oItems = "";
    var oContent = node.content || [];
    for (var j = 0; j < oContent.length; j++) {
      var oli = oContent[j];
      var oliInner = (oli.content || []).map(nodeToHtml).join("");
      oItems += '<li style="margin:2px 0">' + oliInner + '</li>';
    }
    return '<ol style="margin:4px 0;padding-left:20px">' + oItems + '</ol>';
  }

  if (t === "listItem") return '<li>' + children + '</li>';

  if (t === "taskList" || t === "actionList") {
    var tItems = "";
    var tContent = node.content || [];
    for (var k = 0; k < tContent.length; k++) {
      tItems += nodeToHtml(tContent[k]);
    }
    return '<ul style="list-style:none;padding-left:0;margin:4px 0">' + tItems + '</ul>';
  }

  if (t === "taskItem" || t === "action") {
    var state = (attrs.state || "TODO");
    var chkChar = state === "DONE" ? "&#9745;" : "&#9744;";
    var taskInner = (node.content || []).map(nodeToHtml).join("");
    return '<li style="margin:6px 0;display:flex;align-items:flex-start"><span style="margin-right:8px;font-size:1.1em">' + chkChar + '</span><span>' + taskInner + '</span></li>';
  }

  if (t === "codeBlock") {
    var code = "";
    var cContent = node.content || [];
    for (var ci = 0; ci < cContent.length; ci++) {
      if (cContent[ci].type === "text") code += esc(cContent[ci].text || "");
    }
    var langAttr = attrs.language ? ' class="language-' + esc(attrs.language) + '"' : "";
    return '<pre style="background:rgba(0,0,0,0.15);padding:8px;border-radius:4px;overflow-x:auto;margin:4px 0;font-family:monospace;font-size:0.9em;line-height:1.5"><code' + langAttr + '>' + code + '</code></pre>';
  }

  if (t === "blockquote") {
    return '<blockquote style="border-left:4px solid var(--hp-border,#555);margin:8px 0;padding-left:12px;opacity:0.8">' + children + '</blockquote>';
  }

  if (t === "rule") {
    return '<hr style="border:none;border-top:1px solid var(--hp-border,#555);margin:12px 0">';
  }

  if (t === "hardBreak") return "<br>";

  if (t === "table") {
    var rowsHtml = "";
    var rows = node.content || [];
    for (var ri = 0; ri < rows.length; ri++) {
      var rown = rows[ri];
      var colsHtml = "";
      var cells = (rown.content || []);
      for (var ci2 = 0; ci2 < cells.length; ci2++) {
        var cell = cells[ci2];
        var cellHtml = (cell.content || []).map(nodeToHtml).join("");
        if (!cellHtml || !cellHtml.trim()) cellHtml = "&nbsp;";
        cellHtml = '<div style="min-height:2.2em">' + cellHtml + '</div>';
        var isHeader = cell.type === "tableHeader";
        var tagName = isHeader ? "th" : "td";
        var cellStyle = isHeader ? TH_STYLE : CELL_STYLE;
        var colSpan = (cell.attrs && cell.attrs.colspan) ? ' colspan="' + cell.attrs.colspan + '"' : "";
        var rowSpan = (cell.attrs && cell.attrs.rowspan) ? ' rowspan="' + cell.attrs.rowspan + '"' : "";
        var bgColor = (cell.attrs && cell.attrs.background) ? ';background:' + esc(cell.attrs.background) : "";
        colsHtml += '<' + tagName + colSpan + rowSpan + ' style="' + cellStyle + bgColor + '">' + cellHtml + '</' + tagName + '>';
      }
      rowsHtml += '<tr>' + colsHtml + '</tr>';
    }
    return '<table border="1" cellpadding="6" cellspacing="0" style="' + TABLE_STYLE + '"><tbody>' + rowsHtml + '</tbody></table>';
  }

  if (t === "tableRow") return '<tr>' + children + '</tr>';
  if (t === "tableHeader") return '<th style="' + TH_STYLE + '">' + children + '</th>';
  if (t === "tableCell") return '<td style="' + CELL_STYLE + '">' + children + '</td>';

  if (t === "mediaSingle" || t === "mediaGroup") return children;

  if (t === "media") {
    var url = attrs.url || attrs.content || "";
    var alt = esc(attrs.__fileName || attrs.alt || attrs.filename || "image");
    if (url) {
      return '<img src="' + esc(url) + '" alt="' + alt + '" style="max-width:100%;border:1px solid var(--hp-border,#444);border-radius:4px;display:block;margin:8px auto">';
    }
    var attId = attrs.id || "";
    if (attId || attrs.__fileName) {
      return '<div style="text-align:center;margin:8px 0;padding:12px;background:rgba(0,0,0,0.1);border:1px solid var(--hp-border,#444);border-radius:4px">Attachment' + (alt !== "image" ? ": " + alt : "") + '</div>';
    }
    return "";
  }

  if (t === "mention") {
    var txt = (attrs && attrs.text) || ("@" + (attrs.id || "unknown"));
    return '<span style="color:var(--hp-accent,#4a9eff);background:rgba(74,158,255,0.15);padding:1px 4px;border-radius:3px">' + esc(txt) + '</span>';
  }

  if (t === "emoji") return esc(attrs.text || attrs.shortName || "");

  if (t === "status") {
    var statusText = esc(attrs.text || "");
    var color = attrs.color || "neutral";
    var statusColors = { neutral: "#555", purple: "#6554c0", blue: "#0065ff", red: "#de350b", yellow: "#ff991f", green: "#36b37e" };
    var bg = statusColors[color] || "#555";
    return '<span style="background:' + bg + ';color:#fff;padding:2px 6px;border-radius:3px;font-size:0.85em;font-weight:bold">' + statusText + '</span>';
  }

  if (t === "date") return esc(attrs.timestamp || "");

  if (t === "inlineCard") {
    var cardUrl = attrs.url || "";
    if (cardUrl) {
      return '<a href="' + esc(cardUrl) + '" target="_blank" style="color:var(--hp-accent,#4a9eff);text-decoration:underline;padding:2px 6px;background:rgba(0,0,0,0.08);border-radius:4px;display:inline-block;margin:2px 0">' + esc(cardUrl) + '</a>';
    }
    return "";
  }

  if (t === "panel") {
    var ptype = attrs.panelType || "info";
    var panelColors = { info: "rgba(45,55,72,0.3)", note: "rgba(44,82,130,0.3)", success: "rgba(39,103,73,0.3)", warning: "rgba(116,66,16,0.3)", error: "rgba(116,42,42,0.3)" };
    var panelBg = panelColors[ptype] || panelColors.info;
    return '<div style="background:' + panelBg + ';border-left:4px solid var(--hp-accent,#63b3ed);padding:8px 12px;margin:8px 0;border-radius:4px">' + children + '</div>';
  }

  if (t === "expand") {
    var title = attrs.title || "Details";
    return '<details><summary style="cursor:pointer;font-weight:bold;margin:4px 0">' + esc(title) + '</summary>' + children + '</details>';
  }

  if (t === "layoutSection") return '<div style="display:flex;gap:16px;margin:8px 0">' + children + '</div>';
  if (t === "layoutColumn") {
    var width = (attrs.width || 50);
    return '<div style="flex:0 0 ' + width + '%;min-width:0">' + children + '</div>';
  }

  if (t === "decisionList") return '<div style="margin:4px 0">' + children + '</div>';
  if (t === "decisionItem") return '<div style="margin:4px 0;padding:4px 8px;border-left:3px solid var(--hp-accent,#36b37e);background:rgba(54,179,126,0.08)">' + children + '</div>';

  return children;
}

function adfToHtml(doc) {
  if (!doc || typeof doc !== "object") return "";
  return nodeToHtml(doc);
}

/** True when the issue has an Atlassian Document Format description we can render as HTML. */
function hasAdfDescription(adf) {
  if (!adf || typeof adf !== "object" || adf.type !== "doc") return false;
  return Array.isArray(adf.content) && adf.content.length > 0;
}

/* ---- HTML -> ADF ---- */

function getMarks(el) {
  var marks = [];
  var tag = el.tagName;
  if (tag === "STRONG" || tag === "B") marks.push({ type: "strong" });
  if (tag === "EM" || tag === "I") marks.push({ type: "em" });
  if (tag === "CODE" && (!el.parentElement || el.parentElement.tagName !== "PRE")) marks.push({ type: "code" });
  if (tag === "U") marks.push({ type: "underline" });
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") marks.push({ type: "strike" });
  if (tag === "A" && el.href) marks.push({ type: "link", attrs: { href: el.getAttribute("href") || el.href } });
  if (tag === "SUP") marks.push({ type: "subsup", attrs: { type: "sup" } });
  if (tag === "SUB") marks.push({ type: "subsup", attrs: { type: "sub" } });
  if (el.style && el.style.color) marks.push({ type: "textColor", attrs: { color: el.style.color } });
  return marks;
}

function collectInlineMarks(el, inherited) {
  var own = getMarks(el);
  return inherited.concat(own);
}

function isInlineTag(tag) {
  return ["STRONG", "B", "EM", "I", "CODE", "U", "S", "STRIKE", "DEL", "A", "SPAN", "SUB", "SUP"].indexOf(tag) >= 0;
}

function walkInline(el, marks) {
  var nodes = [];
  for (var i = 0; i < el.childNodes.length; i++) {
    var child = el.childNodes[i];
    if (child.nodeType === 3) {
      var text = child.textContent;
      if (text) nodes.push({ type: "text", text: text, marks: marks.length ? marks.slice() : undefined });
    } else if (child.nodeType === 1) {
      var tag = child.tagName;
      if (tag === "BR") {
        nodes.push({ type: "hardBreak" });
      } else if (tag === "IMG") {
        var url = child.getAttribute("src") || "";
        if (url) {
          nodes.push({
            type: "text",
            text: "[image: " + (child.getAttribute("alt") || url) + "]",
            marks: marks.length ? marks.slice() : undefined,
          });
        }
      } else if (isInlineTag(tag)) {
        var childMarks = collectInlineMarks(child, marks);
        nodes.push.apply(nodes, walkInline(child, childMarks));
      } else {
        nodes.push.apply(nodes, walkInline(child, marks));
      }
    }
  }
  return nodes;
}

function domToAdfNodes(parent) {
  var nodes = [];
  for (var i = 0; i < parent.childNodes.length; i++) {
    var child = parent.childNodes[i];
    if (child.nodeType === 3) {
      var text = child.textContent;
      if (text && text.trim()) {
        nodes.push({ type: "paragraph", content: [{ type: "text", text: text }] });
      }
      continue;
    }
    if (child.nodeType !== 1) continue;
    var tag = child.tagName;

    if (tag === "P" || tag === "DIV") {
      var inline = walkInline(child, []);
      nodes.push({ type: "paragraph", content: inline.length ? inline : [] });
    } else if (/^H[1-6]$/.test(tag)) {
      var level = Number(tag[1]);
      var hInline = walkInline(child, []);
      nodes.push({ type: "heading", attrs: { level: level }, content: hInline.length ? hInline : [] });
    } else if (tag === "UL") {
      var hasTask = child.style && child.style.listStyle === "none";
      if (hasTask) {
        var taskItems = [];
        for (var ti = 0; ti < child.children.length; ti++) {
          var tli = child.children[ti];
          if (tli.tagName === "LI") {
            var hasCheck = tli.querySelector && tli.querySelector('input[type="checkbox"]');
            var done = hasCheck && hasCheck.checked;
            taskItems.push({ type: "taskItem", attrs: { localId: String(Date.now()) + ti, state: done ? "DONE" : "TODO" }, content: domToAdfNodes(tli) });
          }
        }
        if (taskItems.length) nodes.push({ type: "taskList", attrs: { localId: String(Date.now()) }, content: taskItems });
      } else {
        var ulItems = [];
        for (var ui = 0; ui < child.children.length; ui++) {
          if (child.children[ui].tagName === "LI") ulItems.push({ type: "listItem", content: domToAdfNodes(child.children[ui]) });
        }
        if (ulItems.length) nodes.push({ type: "bulletList", content: ulItems });
      }
    } else if (tag === "OL") {
      var olItems = [];
      for (var oi = 0; oi < child.children.length; oi++) {
        if (child.children[oi].tagName === "LI") olItems.push({ type: "listItem", content: domToAdfNodes(child.children[oi]) });
      }
      if (olItems.length) nodes.push({ type: "orderedList", content: olItems });
    } else if (tag === "LI") {
      var hasBlock = false;
      for (var bi = 0; bi < child.children.length; bi++) {
        if (["P", "UL", "OL", "DIV", "TABLE", "PRE", "BLOCKQUOTE"].indexOf(child.children[bi].tagName) >= 0) { hasBlock = true; break; }
      }
      if (hasBlock) {
        nodes.push.apply(nodes, domToAdfNodes(child));
      } else {
        var liInline = walkInline(child, []);
        if (liInline.length) nodes.push({ type: "paragraph", content: liInline });
      }
    } else if (tag === "PRE") {
      var codeEl = child.querySelector("code");
      var codeText = codeEl ? codeEl.textContent : child.textContent;
      var language = "";
      if (codeEl) {
        var cls = codeEl.className || "";
        var lm = cls.match(/language-(\w+)/);
        if (lm) language = lm[1];
      }
      var cbAttrs = language ? { language: language } : {};
      nodes.push({ type: "codeBlock", attrs: cbAttrs, content: codeText ? [{ type: "text", text: codeText }] : [] });
    } else if (tag === "BLOCKQUOTE") {
      nodes.push({ type: "blockquote", content: domToAdfNodes(child) });
    } else if (tag === "HR") {
      nodes.push({ type: "rule" });
    } else if (tag === "BR") {
      nodes.push({ type: "paragraph", content: [] });
    } else if (tag === "TABLE") {
      var tRows = [];
      var allTrs = child.querySelectorAll("tr");
      for (var tri = 0; tri < allTrs.length; tri++) {
        var tr = allTrs[tri];
        var tCells = [];
        for (var tci = 0; tci < tr.children.length; tci++) {
          var td = tr.children[tci];
          if (td.tagName === "TH") {
            tCells.push({ type: "tableHeader", content: domToAdfNodes(td) });
          } else if (td.tagName === "TD") {
            tCells.push({ type: "tableCell", content: domToAdfNodes(td) });
          }
        }
        if (tCells.length) tRows.push({ type: "tableRow", content: tCells });
      }
      if (tRows.length) nodes.push({ type: "table", content: tRows });
    } else if (tag === "IMG") {
      var imgUrl = child.getAttribute("src") || "";
      if (imgUrl) {
        nodes.push({
          type: "mediaSingle",
          attrs: { layout: "center" },
          content: [{ type: "media", attrs: { type: "external", url: imgUrl } }],
        });
      }
    } else if (tag === "DETAILS") {
      var summary = child.querySelector("summary");
      var expTitle = summary ? summary.textContent : "Details";
      var expContent = domToAdfNodes(child);
      nodes.push({ type: "expand", attrs: { title: expTitle }, content: expContent });
    } else if (isInlineTag(tag)) {
      var inlinePar = walkInline(child, getMarks(child));
      if (inlinePar.length) nodes.push({ type: "paragraph", content: inlinePar });
    } else {
      nodes.push.apply(nodes, domToAdfNodes(child));
    }
  }
  return nodes;
}

function cleanAdfContent(nodes) {
  return nodes.filter(function(n) {
    if (!n || !n.type) return false;
    if (n.content && Array.isArray(n.content)) {
      n.content = cleanAdfContent(n.content);
    }
    return true;
  });
}

function htmlToAdf(html) {
  if (!html || typeof html !== "string" || !html.trim()) {
    return { type: "doc", version: 1, content: [] };
  }
  var parser = new DOMParser();
  var docEl = parser.parseFromString(html, "text/html");
  var body = docEl.body;
  var content = cleanAdfContent(domToAdfNodes(body));
  return { type: "doc", version: 1, content: content };
}


/* --- variables.js --- */
/**
 * Variable system: {KEY=value} definitions, {KEY} references.
 * Applied at upload time to resolve inline variables across ticket fields.
 */

const VAR_DEF_RE = /\{([A-Z])=([^}]+)\}/g;
const VAR_REF_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function collectVariables(ticket) {
  const vars = {};
  for (const key of Object.keys(ticket)) {
    const val = ticket[key];
    if (typeof val !== "string") continue;
    let m;
    VAR_DEF_RE.lastIndex = 0;
    while ((m = VAR_DEF_RE.exec(val)) !== null) {
      vars[m[1]] = m[2];
    }
  }
  return vars;
}

function replaceInString(str, vars) {
  if (typeof str !== "string" || !str) return str;
  let result = str.replace(VAR_DEF_RE, (_, _k, val) => val);
  result = result.replace(VAR_REF_RE, (full, key) => {
    if (key in vars) return vars[key];
    return full;
  });
  return result;
}

function replaceInAdf(node, vars) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n) => replaceInAdf(n, vars));
  const out = { ...node };
  if (out.type === "text" && typeof out.text === "string") {
    out.text = replaceInString(out.text, vars);
  }
  if (out.content && Array.isArray(out.content)) {
    out.content = out.content.map((n) => replaceInAdf(n, vars));
  }
  if (out.attrs && typeof out.attrs === "object") {
    out.attrs = { ...out.attrs };
    for (const k of Object.keys(out.attrs)) {
      if (typeof out.attrs[k] === "string") out.attrs[k] = replaceInString(out.attrs[k], vars);
    }
  }
  return out;
}

const APPLY_FIELDS = ["Summary", "Description", "Labels", "Components", "Environment", "Variables"];

function applyVariables(ticket) {
  const vars = collectVariables(ticket);
  if (Object.keys(vars).length === 0) return ticket;
  const out = { ...ticket };
  for (const f of APPLY_FIELDS) {
    if (typeof out[f] === "string") out[f] = replaceInString(out[f], vars);
  }
  if (out["Description ADF"] && typeof out["Description ADF"] === "object") {
    out["Description ADF"] = replaceInAdf(out["Description ADF"], vars);
  }
  let comments = [];
  try { comments = typeof out.Comment === "string" ? JSON.parse(out.Comment) : (out.Comment || []); } catch { comments = []; }
  if (Array.isArray(comments)) {
    const updated = comments.map((c) => {
      if (c && typeof c.body === "string" && !c.posted) return { ...c, body: replaceInString(c.body, vars) };
      return c;
    });
    out.Comment = JSON.stringify(updated);
  }
  return out;
}


/* --- fieldStyles.js --- */
/** Shared Tailwind classes so inputs stay dark regardless of host autofill/light defaults. */

const inputClass =
  "w-full rounded-md border border-zinc-600/90 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none ring-0 transition placeholder:text-zinc-500 focus:border-sky-600/80 focus:ring-2 focus:ring-sky-600/40 [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_#18181b] [&:-webkit-autofill]:[-webkit-text-fill-color:#e4e4e7]";

const textareaClass = `${inputClass} min-h-[6rem] resize-y font-mono text-xs leading-relaxed`;

const selectClass = `${inputClass} cursor-pointer appearance-none pr-8`;

const labelClass = "text-xs font-medium text-zinc-400";

const helpTextClass = "text-sm leading-relaxed text-zinc-400";

const checkboxClass =
  "h-4 w-4 shrink-0 rounded border-zinc-500 bg-zinc-800 text-sky-500 focus:ring-2 focus:ring-sky-500/50";


/* --- debugLog.js --- */
/**
 * Avalanche Jira extension — structured debug logging (no secrets).
 * No work at module load (safe in strict/sandboxed embeds); initializes on first log.
 */

const PREFIX = "[avalanche-jira]";
const DEBUG_RING_KEY = "avalanche-jira-debug-ring";
const MAX_ENTRIES = 250;

function isSensitiveKey(k) {
  return (
    typeof k === "string" &&
    /token|password|secret|authorization|apikey|credential|auth|cookie/i.test(k)
  );
}

let ring = [];
let didInit = false;

function loadRing() {
  try {
    const raw = localStorage.getItem(DEBUG_RING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) ring = parsed.slice(-MAX_ENTRIES);
    }
  } catch {
    ring = [];
  }
}

function saveRing() {
  try {
    localStorage.setItem(DEBUG_RING_KEY, JSON.stringify(ring.slice(-MAX_ENTRIES)));
  } catch {
    /* quota / private mode */
  }
}

function ensureInit() {
  if (didInit) return;
  didInit = true;
  if (typeof localStorage !== "undefined") {
    loadRing();
  }
  if (typeof window !== "undefined") {
    window.__AVALANCHE_JIRA_DEBUG__ = {
      getLogs: getDebugLogSnapshot,
      getText: getDebugLogText,
      clear: clearDebugLog,
      log: debugLog,
      warn: debugWarn,
      error: debugError,
      version: "2",
    };
    console.log(PREFIX, "debug API ready (__AVALANCHE_JIRA_DEBUG__)");
  }
}

function redactValue(key, val) {
  if (val == null) return val;
  if (isSensitiveKey(key)) return "[REDACTED]";
  if (typeof val === "string" && val.length > 500) {
    return `${val.slice(0, 500)}…(${val.length} chars)`;
  }
  return val;
}

function redactDeep(obj, depth = 0) {
  if (depth > 8) return "[max depth]";
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: obj.message,
      stack: obj.stack ? String(obj.stack).slice(0, 4000) : undefined,
    };
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map((v) => redactDeep(v, depth + 1));
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveKey(k)) {
      out[k] = "[REDACTED]";
    } else if (v != null && typeof v === "object") {
      out[k] = redactDeep(v, depth + 1);
    } else {
      out[k] = redactValue(k, v);
    }
  }
  return out;
}

function serializeArg(arg) {
  if (arg instanceof Error) {
    return {
      _error: true,
      name: arg.name,
      message: arg.message,
      stack: arg.stack ? String(arg.stack).slice(0, 4000) : undefined,
    };
  }
  if (typeof arg === "string") {
    return arg.length > 2000 ? `${arg.slice(0, 2000)}…` : arg;
  }
  if (typeof arg === "object" && arg !== null) {
    try {
      return redactDeep(arg);
    } catch {
      return String(arg);
    }
  }
  return arg;
}

function pushEntry(level, category, parts) {
  ensureInit();
  const entry = {
    ts: new Date().toISOString(),
    level,
    category: category || "app",
    parts: parts.map(serializeArg),
  };
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring = ring.slice(-MAX_ENTRIES);
  saveRing();
  return entry;
}

function toConsole(level, category, parts) {
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  fn(PREFIX, category, ...parts);
}

function debugLog(category, ...parts) {
  pushEntry("info", category, parts);
  toConsole("info", category, parts);
}

function debugWarn(category, ...parts) {
  pushEntry("warn", category, parts);
  toConsole("warn", category, parts);
}

function debugError(category, ...parts) {
  pushEntry("error", category, parts);
  toConsole("error", category, parts);
}

function safeUrl(u) {
  try {
    const x = new URL(u, "https://placeholder.local");
    return `${x.origin}${x.pathname}`;
  } catch {
    return String(u).slice(0, 200);
  }
}

function getDebugLogSnapshot() {
  ensureInit();
  return [...ring];
}

function getDebugLogText() {
  ensureInit();
  return ring
    .map((e) => {
      let line = `${e.ts} [${e.level}] ${e.category}`;
      try {
        line += ` ${JSON.stringify(e.parts)}`;
      } catch {
        line += " [unserializable]";
      }
      return line;
    })
    .join("\n");
}

function clearDebugLog() {
  ensureInit();
  ring = [];
  try {
    localStorage.removeItem(DEBUG_RING_KEY);
  } catch {
    /* ignore */
  }
}

function installDebugGlobal() {
  ensureInit();
}

function logWindowError(kind, ev) {
  const fn = kind === "error" ? console.error : console.warn;
  if (kind === "unhandledrejection") {
    fn(PREFIX, "[window.unhandledrejection]", ev && ev.reason);
  } else {
    fn(
      PREFIX,
      "[window.error]",
      ev && ev.message,
      ev && ev.filename,
      ev && ev.lineno,
      ev && ev.error,
    );
  }
  const f = String((ev && ev.filename) || "");
  const m = String(
    (ev && ev.message) ||
      (ev && ev.reason && ev.reason.message) ||
      (ev && ev.reason) ||
      "",
  );
  const likelyOurs =
    /avalanche|jiraClient|AvalancheView|AvalancheMain|fieldStyles|issueMap|buildUpdate|debugLog/i.test(
      f + m,
    ) || /extensions?[\\/]/i.test(f);
  if (likelyOurs) {
    debugError("window", kind, {
      message: m.slice(0, 2000),
      filename: f,
      lineno: ev && ev.lineno,
      colno: ev && ev.colno,
      stack: (ev && ev.error && ev.error.stack) || (ev && ev.reason && ev.reason.stack),
    });
  }
}


/* --- issueMap.js --- */
function fmtSeconds(s) {
  if (s == null || s === "") return "";
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 60) return `${n}s`;
  let m = Math.floor(n / 60);
  if (m < 60) return `${m}m`;
  let h = Math.floor(m / 60);
  m %= 60;
  if (h < 8) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 8);
  h %= 8;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ") || "";
}

function jiraAttachmentsToField(attachmentList) {
  if (!attachmentList || !Array.isArray(attachmentList)) return "";
  const items = [];
  for (const a of attachmentList) {
    if (!a || typeof a !== "object") continue;
    const fn = a.filename || a.name || "";
    const url = a.content || "";
    if (fn || url) {
      items.push({
        filename: fn,
        content: url,
        size: a.size || 0,
        mimeType: a.mimeType || "",
        thumbnail: a.thumbnail || "",
      });
    }
  }
  if (!items.length) return "";
  return JSON.stringify(items);
}

function parseJiraComments(commentField) {
  if (!commentField) return "[]";
  let rawList = [];
  if (typeof commentField === "object" && commentField.comments) {
    rawList = commentField.comments || [];
  } else if (Array.isArray(commentField)) {
    rawList = commentField;
  }
  const parsed = [];
  for (const c of rawList) {
    if (!c) continue;
    const authorObj = c.author || {};
    const author =
      authorObj.displayName || authorObj.emailAddress || "Unknown";
    let bodyNode = c.body;
    let body = "";
    if (bodyNode && typeof bodyNode === "object") {
      try {
        body = extractTextFromAdf(bodyNode);
      } catch {
        body = String(bodyNode);
      }
    } else {
      body = String(bodyNode || "");
    }
    parsed.push({
      id: c.id || "",
      author,
      date: c.created || "",
      body,
      posted: true,
    });
  }
  return JSON.stringify(parsed);
}

function parseJiraIssueLinks(linksField) {
  if (!linksField || !Array.isArray(linksField)) return "[]";
  const parsed = [];
  for (const lnk of linksField) {
    try {
      const ltype = lnk.type || {};
      let direction;
      let directionLabel;
      let issueObj;
      if (lnk.outwardIssue) {
        direction = "outward";
        directionLabel = ltype.outward || "";
        issueObj = lnk.outwardIssue;
      } else {
        direction = "inward";
        directionLabel = ltype.inward || "";
        issueObj = lnk.inwardIssue || {};
      }
      parsed.push({
        id: lnk.id || "",
        type_name: ltype.name || "",
        direction,
        direction_label: directionLabel,
        key: issueObj.key || "",
        summary: (issueObj.fields && issueObj.fields.summary) || "",
        status:
          (issueObj.fields &&
            issueObj.fields.status &&
            issueObj.fields.status.name) ||
          "",
        posted: true,
      });
    } catch {
      /* skip */
    }
  }
  return JSON.stringify(parsed);
}

function detectEpicLinkField(fields) {
  const cf14 = fields.customfield_10014;
  if (cf14 && typeof cf14 === "string" && cf14.trim()) {
    return { mode: "classic", key: cf14.trim() };
  }
  const parentObj = fields.parent || {};
  if (parentObj.key) {
    const parentType =
      (parentObj.fields &&
        parentObj.fields.issuetype &&
        parentObj.fields.issuetype.name) ||
      "";
    if (String(parentType).toLowerCase() === "epic") {
      return { mode: "nextgen", key: parentObj.key };
    }
  }
  return { mode: null, key: "" };
}

function mapEpicAndLinkFields(fields, issueDict) {
  const { mode: epicMode, key: epicKey } = detectEpicLinkField(fields);
  issueDict["Epic Link"] = epicKey;
  issueDict._epic_mode = epicMode || "";

  const parentObj = fields.parent || {};
  if (epicMode === "nextgen" && parentObj.key) {
    issueDict["Epic Name"] =
      (parentObj.fields && parentObj.fields.summary) ||
      fields.customfield_10011 ||
      "";
  } else {
    issueDict["Epic Name"] = fields.customfield_10011 || "";
  }

  const parentKey = parentObj.key || "";
  const parentFields = parentObj.fields || {};
  const parentSummary = parentFields.summary || "";
  issueDict.Parent = parentKey;
  issueDict["Parent key"] = parentKey;
  issueDict["Parent summary"] = parentSummary;

  issueDict["Issue Links"] = parseJiraIssueLinks(fields.issuelinks);
}

/** Field ids fully mapped in mapIssueJsonToDict; everything else is stored under "Jira fields (extra)". */
const JIRA_FIELD_KEYS_HANDLED = new Set([
  "summary",
  "description",
  "issuetype",
  "status",
  "project",
  "priority",
  "assignee",
  "reporter",
  "creator",
  "created",
  "updated",
  "labels",
  "components",
  "environment",
  "attachment",
  "comment",
  "parent",
  "issuelinks",
  "fixVersions",
  "timeoriginalestimate",
  "timeestimate",
  "customfield_10014",
  "customfield_10011",
  "customfield_10020",
  "resolution",
  "subtasks",
]);

function jiraFieldValueToStore(v, depth) {
  if (depth > 8) return "[nested]";
  if (v == null) return null;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v;
  if (Array.isArray(v)) return v.map((x) => jiraFieldValueToStore(x, depth + 1));
  if (t !== "object") return String(v);
  if (v.type === "doc" && Array.isArray(v.content)) {
    try {
      return extractTextFromAdf(v) || "[ADF]";
    } catch {
      return "[ADF]";
    }
  }
  if (v.displayName) return v.displayName;
  if (v.name != null && (v.id != null || v.avatarUrls)) return v.name;
  if (v.key && v.fields) return v.key + (v.fields.summary ? " — " + v.fields.summary : "");
  if (v.key && !v.fields) return v.key;
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (k === "self" && typeof val === "string") continue;
    if (k === "avatarUrls" && depth > 2) continue;
    out[k] = jiraFieldValueToStore(val, depth + 1);
  }
  return out;
}

function appendUnmappedJiraFields(fields, result) {
  const extras = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (JIRA_FIELD_KEYS_HANDLED.has(k)) continue;
    extras[k] = jiraFieldValueToStore(v, 0);
  }
  const keys = Object.keys(extras);
  if (!keys.length) {
    delete result["Jira fields (extra)"];
    return;
  }
  try {
    result["Jira fields (extra)"] = JSON.stringify(extras);
  } catch {
    result["Jira fields (extra)"] = '{"_error":"Could not serialize extra fields"}';
  }
}

/**
 * Build a project-aware field catalog independent of fetched tickets.
 *
 * We intentionally combine multiple Jira sources because each has blind spots:
 * - /field: site/global definitions (id -> display name)
 * - /field/search?projectIds=: project-visible fields
 * - /issue/createmeta: create-screen fields
 * - /issue/{key}/editmeta on sampled project issues: edit-screen fields by issue type
 */
async function buildJiraFieldCatalog(client, projectKey) {
  if (!client || typeof client.listAllFields !== "function") {
    throw new Error("Jira client not available");
  }
  const pk = String(projectKey || "SUNDANCE").trim() || "SUNDANCE";
  const allFields = await client.listAllFields();
  const fieldById = {};
  for (const f of allFields) {
    if (f && f.id) {
      fieldById[f.id] = {
        name: f.name || f.id,
        key: f.key || "",
        custom: !!f.custom,
      };
    }
  }
  const projectFieldIds = new Set();
  const sources = {
    fieldSearch: 0,
    createMeta: 0,
    editMeta: 0,
  };
  let createMetaError = null;
  let fieldSearchError = null;
  let editMetaError = null;
  let projectId = null;
  let workTypes = [];
  try {
    if (typeof client.getProject === "function") {
      const p = await client.getProject(pk);
      projectId = p && p.id ? Number(p.id) : null;
    }
  } catch (e) {
    debugWarn("jira", "project lookup failed", e?.message || e);
  }

  try {
    if (projectId != null && typeof client.listFieldsForProject === "function") {
      const fs = await client.listFieldsForProject(projectId);
      for (const f of fs || []) {
        const id = (f && (f.id || f.fieldId)) || "";
        if (!id) continue;
        if (!projectFieldIds.has(id)) sources.fieldSearch += 1;
        projectFieldIds.add(id);
      }
    }
  } catch (e) {
    fieldSearchError = e.message || String(e);
    debugWarn("jira", "field/search failed", fieldSearchError);
  }

  // Try the new paginated createmeta API first (Jira Cloud ≥ 2022).
  // Falls back to the legacy endpoint if the new one returns an error.
  try {
    if (typeof client.listCreateMetaIssueTypes === "function") {
      const issueTypes = await client.listCreateMetaIssueTypes(pk);
      for (const it of issueTypes) {
        if (it && (it.id || it.name)) {
          workTypes.push({ id: it.id || "", name: it.name || "" });
        }
      }
    }
  } catch (e) {
    debugWarn("jira", "createmeta/issuetypes (new API) failed", e?.message || e);
  }

  // Legacy createmeta for older Jira or when new API failed (gives us fields in one shot, though fields are often truncated).
  try {
    const cm = await client.getCreateMetaForProject(pk);
    const projects = (cm && cm.projects) || [];
    for (const p of projects) {
      for (const it of p.issuetypes || []) {
        if (it && (it.id || it.name)) {
          workTypes.push({ id: it.id || "", name: it.name || "" });
        }
        const flds = it.fields && typeof it.fields === "object" ? it.fields : {};
        for (const fk of Object.keys(flds)) {
          if (!projectFieldIds.has(fk)) sources.createMeta += 1;
          projectFieldIds.add(fk);
          const fd = flds[fk];
          if (fieldById[fk] && fd && typeof fd === "object") {
            if (!fieldById[fk].schema && fd.schema) fieldById[fk].schema = fd.schema;
            if (fd.allowedValues && fd.allowedValues.length) fieldById[fk].hasAllowedValues = true;
          }
        }
      }
    }
  } catch (e) {
    createMetaError = e.message || String(e);
    debugWarn("jira", "createmeta (legacy) failed", createMetaError);
  }
  workTypes = workTypes
    .filter((x) => x && (x.id || x.name))
    .filter((x, i, arr) => arr.findIndex((y) => y.id === x.id && y.name === x.name) === i);

  const editMetaOptions = {};
  try {
    // Fallback for fields not exposed via createmeta: sample one issue per type and pull editmeta fields.
    if (typeof client.getIssueEditMeta === "function" && typeof client.searchJql === "function") {
      const seenIssueKeys = new Set();
      for (const wt of workTypes) {
        const wtName = String(wt.name || "").trim();
        if (!wtName) continue;
        const safeName = wtName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const sampleJql =
          'project = "' + pk + '" AND issuetype = "' + safeName + '" ORDER BY updated DESC';
        const sr = await client.searchJql(sampleJql, 1);
        const sample = (sr && sr.issues && sr.issues[0]) || null;
        const issueKey = sample && sample.key ? String(sample.key) : "";
        if (!issueKey || seenIssueKeys.has(issueKey)) continue;
        seenIssueKeys.add(issueKey);
        const em = await client.getIssueEditMeta(issueKey);
        const flds = (em && em.fields) || {};
        for (const fid of Object.keys(flds)) {
          if (!projectFieldIds.has(fid)) sources.editMeta += 1;
          projectFieldIds.add(fid);
          const fd = flds[fid];
          if (fieldById[fid] && fd && typeof fd === "object") {
            if (!fieldById[fid].schema && fd.schema) fieldById[fid].schema = fd.schema;
            if (fd.allowedValues && fd.allowedValues.length) fieldById[fid].hasAllowedValues = true;
          }
        }
        mergeOptionsFromEditMetaRaw(flds, editMetaOptions);
      }
    }
  } catch (e) {
    editMetaError = e.message || String(e);
    debugWarn("jira", "issue editmeta fallback failed", editMetaError);
  }

  // If project-scoped endpoints are unavailable, still expose everything we know.
  if (projectFieldIds.size === 0) {
    for (const id of Object.keys(fieldById)) projectFieldIds.add(id);
  }

  return {
    version: 6,
    syncedAt: new Date().toISOString(),
    projectKey: pk,
    projectId,
    workTypeIds: workTypes.map((x) => x.id).filter(Boolean),
    workTypeNames: workTypes.map((x) => x.name).filter(Boolean),
    projectFieldIds: [...projectFieldIds].sort(),
    fieldById,
    allFieldsCount: Object.keys(fieldById).length,
    sourceCounts: sources,
    editMetaOptions,
    createMetaError,
    fieldSearchError,
    editMetaError,
  };
}

function extractAllowedValueText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v !== "object") return String(v);
  return String(v.name || v.value || v.displayName || v.label || v.key || "").trim();
}

/**
 * Maps a Jira field display name to the option key used in meta.options.
 * When autoMap=true, any field name not in the hardcoded list is returned as-is
 * so that custom dropdown fields are captured automatically.
 */
function mapCreateMetaFieldNameToOptionKey(fieldName, autoMap = false) {
  const n = String(fieldName || "").trim().toLowerCase();
  if (!n) return null;
  if (n === "priority") return "Priority";
  if (n === "status") return "Status";
  if (n === "labels" || n === "label") return "Labels";
  if (n === "components" || n === "component") return "Components";
  if (n === "fix versions" || n === "fix version") return "Fix Version";
  if (n === "sprint") return "Sprint";
  if (n === "assignee") return "Assignee";
  if (n === "reporter") return "Reporter";
  if (n === "resolution") return "Resolution";
  if (n === "issuetype" || n === "issue type") return "Issue Type";
  if (autoMap) return String(fieldName || "").trim() || null;
  return null;
}

function mergeOptionsFromCreateMeta(cm, options) {
  const counts = { issueType: 0, allowedValues: 0 };
  const projects = (cm && cm.projects) || [];
  for (const p of projects) {
    for (const it of p.issuetypes || []) {
      if (it && it.name && mergeOptionValues(options, "Issue Type", [it.name])) counts.issueType += 1;
      const fields = it && it.fields && typeof it.fields === "object" ? it.fields : {};
      for (const f of Object.values(fields)) {
        if (!f || typeof f !== "object") continue;
        const key = mapCreateMetaFieldNameToOptionKey(f.name, true);
        if (!key) continue;
        const vals = (f.allowedValues || [])
          .map(extractAllowedValueText)
          .filter(Boolean);
        if (!vals.length) continue;
        if (mergeOptionValues(options, key, vals)) counts.allowedValues += vals.length;
      }
    }
  }
  return counts;
}

/**
 * Extracts allowedValues from a raw editmeta fields map (keyed by field id).
 * Uses autoMap so custom dropdown fields are captured alongside standard ones.
 */
function mergeOptionsFromEditMetaRaw(fieldsMap, options) {
  let count = 0;
  for (const fd of Object.values(fieldsMap || {})) {
    if (!fd || typeof fd !== "object") continue;
    const key = mapCreateMetaFieldNameToOptionKey(fd.name, true);
    if (!key) continue;
    const vals = (fd.allowedValues || []).map(extractAllowedValueText).filter(Boolean);
    if (!vals.length) continue;
    if (mergeOptionValues(options, key, vals)) count += vals.length;
  }
  return count;
}

/**
 * Fetches and merges all dropdown option sets for Sundance project fields.
 * fieldCatalog is the result of buildJiraFieldCatalog — used to merge editmeta-derived
 * options and to look up the project ID for issue-type listing.
 */
async function buildJiraOptionCatalog(client, projectKey, baseOptions, fieldCatalog = null) {
  const pk = String(projectKey || "SUNDANCE").trim() || "SUNDANCE";
  const options = { ...(baseOptions || {}) };
  const warnings = [];
  const sourceCounts = {
    createMeta: 0,
    editMeta: 0,
    priorities: 0,
    resolutions: 0,
    statuses: 0,
    components: 0,
    fixVersions: 0,
    labels: 0,
    issueTypes: 0,
    sprints: 0,
  };

  // Merge options already extracted from editmeta sampling in buildJiraFieldCatalog.
  if (fieldCatalog && fieldCatalog.editMetaOptions) {
    for (const [key, vals] of Object.entries(fieldCatalog.editMetaOptions)) {
      if (Array.isArray(vals) && vals.length) {
        if (mergeOptionValues(options, key, vals)) sourceCounts.editMeta += vals.length;
      }
    }
  }

  // New paginated createmeta API — fetches every field with full allowedValues per issue type.
  // This replaces the deprecated expand=projects.issuetypes.fields approach on Jira Cloud.
  let createMetaNewWorked = false;
  if (typeof client.listCreateMetaIssueTypes === "function" && typeof client.listCreateMetaFields === "function") {
    try {
      const issueTypes = await client.listCreateMetaIssueTypes(pk);
      for (const it of issueTypes || []) {
        if (it && it.name) {
          mergeOptionValues(options, "Issue Type", [it.name]);
          sourceCounts.issueTypes += 1;
        }
        if (!it || !it.id) continue;
        const fields = await client.listCreateMetaFields(pk, it.id);
        for (const f of fields || []) {
          if (!f || typeof f !== "object") continue;
          const key = mapCreateMetaFieldNameToOptionKey(f.name || f.fieldId, true);
          if (!key) continue;
          const vals = (f.allowedValues || []).map(extractAllowedValueText).filter(Boolean);
          if (vals.length && mergeOptionValues(options, key, vals)) sourceCounts.createMeta += vals.length;
        }
      }
      createMetaNewWorked = true;
    } catch (e) {
      warnings.push("createmeta-v2: " + (e.message || String(e)));
    }
  }

  // Legacy createmeta fallback — still useful when new API isn't available.
  if (!createMetaNewWorked) {
    try {
      const cm = await client.getCreateMetaForProject(pk);
      const c = mergeOptionsFromCreateMeta(cm, options);
      sourceCounts.createMeta += c.allowedValues;
      sourceCounts.issueTypes += c.issueType;
    } catch (e) {
      warnings.push("createmeta-legacy: " + (e.message || String(e)));
    }
  }

  try {
    const pri = await client.listPriorities();
    const vals = pri.map((x) => extractAllowedValueText(x)).filter(Boolean);
    if (mergeOptionValues(options, "Priority", vals)) sourceCounts.priorities += vals.length;
  } catch (e) {
    warnings.push("priority/search: " + (e.message || String(e)));
  }

  try {
    const res = await client.listResolutions();
    const vals = res.map((x) => extractAllowedValueText(x)).filter(Boolean);
    if (mergeOptionValues(options, "Resolution", vals)) sourceCounts.resolutions += vals.length;
  } catch (e) {
    warnings.push("resolutions: " + (e.message || String(e)));
  }

  try {
    const sts = await client.listProjectStatuses(pk);
    const vals = [];
    for (const row of sts || []) {
      for (const s of row.statuses || []) {
        const t = extractAllowedValueText(s);
        if (t) vals.push(t);
      }
    }
    if (mergeOptionValues(options, "Status", vals)) sourceCounts.statuses += vals.length;
  } catch (e) {
    warnings.push("project statuses: " + (e.message || String(e)));
  }

  try {
    const comps = await client.listProjectComponents(pk);
    const vals = comps.map((x) => extractAllowedValueText(x)).filter(Boolean);
    if (mergeOptionValues(options, "Components", vals)) sourceCounts.components += vals.length;
  } catch (e) {
    warnings.push("project components: " + (e.message || String(e)));
  }

  try {
    const vers = await client.listProjectVersions(pk);
    const vals = vers.map((x) => extractAllowedValueText(x)).filter(Boolean);
    if (mergeOptionValues(options, "Fix Version", vals)) sourceCounts.fixVersions += vals.length;
  } catch (e) {
    warnings.push("project versions: " + (e.message || String(e)));
  }

  try {
    const labels = await client.listLabels();
    if (mergeOptionValues(options, "Labels", labels)) sourceCounts.labels += labels.length;
  } catch (e) {
    warnings.push("labels: " + (e.message || String(e)));
  }

  // Issue types from dedicated project endpoint (supplements createmeta).
  const projectId = fieldCatalog && fieldCatalog.projectId;
  if (projectId && typeof client.listProjectIssueTypes === "function") {
    try {
      const types = await client.listProjectIssueTypes(projectId);
      const vals = types.map((x) => extractAllowedValueText(x)).filter(Boolean);
      if (mergeOptionValues(options, "Issue Type", vals)) sourceCounts.issueTypes += vals.length;
    } catch (e) {
      warnings.push("issuetype/project: " + (e.message || String(e)));
    }
  }

  // Sprints from Agile board API (all states).
  if (typeof client.getBoards === "function" && typeof client.getBoardSprints === "function") {
    try {
      const boards = await client.getBoards(pk);
      const boardErrors = [];
      for (const board of boards || []) {
        if (!board || !board.id) continue;
        try {
          const sprints = await client.getBoardSprints(board.id, "active,future,closed");
          const vals = sprints.map((s) => (s && s.name) || "").filter(Boolean);
          if (mergeOptionValues(options, "Sprint", vals)) sourceCounts.sprints += vals.length;
        } catch (e) {
          // Individual boards may not support sprints (e.g. Kanban boards) — skip silently.
          boardErrors.push(String(e.message || e).replace(/\s+/g, " ").slice(0, 80));
        }
      }
      if (boardErrors.length && sourceCounts.sprints === 0) {
        warnings.push("sprints (all boards failed): " + boardErrors[0]);
      }
    } catch (e) {
      warnings.push("sprints: " + (e.message || String(e)));
    }
  }

  return {
    options,
    sourceCounts,
    warnings,
    syncedAt: new Date().toISOString(),
    projectKey: pk,
  };
}

/**
 * Canonical mapping from Jira issue JSON → Avalanche row dict (list_view._map_issue_json_to_dict).
 */
function mapIssueJsonToDict(issueJson, base = null) {
  if (!issueJson || typeof issueJson !== "object") {
    return base ? { ...base } : {};
  }
  const fields = issueJson.fields || {};
  const statusObj = fields.status || {};
  const result = base ? { ...base } : {};
  // Mark every row that originates from Jira so saveToJira can cross-reference it.
  result._jira_fetched = true;

  result["Issue key"] = issueJson.key || result["Issue key"] || "";
  result["Issue id"] = issueJson.id || result["Issue id"] || "";
  result.Summary = fields.summary || "";
  result["Issue Type"] = (fields.issuetype || {}).name || "";
  result.Status = statusObj.name || "";
  result["Status Category"] =
    (statusObj.statusCategory || {}).name || "";
  result["Project key"] = (fields.project || {}).key || "";
  result["Project name"] = (fields.project || {}).name || "";
  result.Priority = (fields.priority || {}).name || "";
  result.Assignee =
    (fields.assignee || {}).displayName ||
    (fields.assignee || {}).emailAddress ||
    "";
  result._assignee_accountId = (fields.assignee || {}).accountId || "";
  result.Reporter =
    (fields.reporter || {}).displayName ||
    (fields.reporter || {}).emailAddress ||
    "";
  result._reporter_accountId = (fields.reporter || {}).accountId || "";
  result.Creator =
    (fields.creator || {}).displayName ||
    (fields.creator || {}).emailAddress ||
    "";
  result.Created = fields.created || "";
  result.Updated = fields.updated || "";
  result.Labels = (fields.labels || []).join("; ");
  result.Components = (fields.components || [])
    .map((c) => c.name || "")
    .filter(Boolean)
    .join("; ");
  const compMap = {};
  for (const c of fields.components || []) {
    if (c && c.name && c.id) compMap[c.name] = c.id;
  }
  result._component_ids = compMap;

  const env = fields.environment;
  if (env && typeof env === "object") {
    try {
      result.Environment = extractTextFromAdf(env);
    } catch {
      result.Environment = "";
    }
  } else if (typeof env === "string") {
    result.Environment = env;
  } else {
    result.Environment = "";
  }

  const renderedHtml =
    (issueJson.renderedFields && issueJson.renderedFields.description) || "";
  if (renderedHtml) result["Description Rendered"] = renderedHtml;

  const desc = fields.description;
  if (desc && typeof desc === "object") {
    result["Description ADF"] = desc;
    try {
      result.Description = extractTextFromAdf(desc);
    } catch {
      result.Description = result.Description || "";
    }
  } else if (typeof desc === "string") {
    result.Description = desc;
  } else {
    result.Description = result.Description || "";
  }

  result.Attachment = jiraAttachmentsToField(fields.attachment) || "";
  result.Comment = parseJiraComments(fields.comment);
  mapEpicAndLinkFields(fields, result);

  const sprints = fields.customfield_10020 || [];
  if (Array.isArray(sprints) && sprints.length) {
    const active = sprints.filter(
      (s) => s && typeof s === "object" && s.state === "active",
    );
    const pick = active[0] || sprints[sprints.length - 1];
    result.Sprint =
      pick && typeof pick === "object" ? pick.name || "" : String(pick || "");
    result._sprint_id = pick && typeof pick === "object" ? pick.id || "" : "";
  } else {
    result.Sprint = result.Sprint || "";
    result._sprint_id = result._sprint_id || "";
  }

  const fixVers = fields.fixVersions || [];
  result["Fix Version"] = fixVers
    .filter((v) => v && typeof v === "object")
    .map((v) => v.name || "")
    .filter(Boolean)
    .join("; ");
  const fvMap = {};
  for (const v of fixVers) {
    if (v && v.name && v.id) fvMap[v.name] = v.id;
  }
  result._fixversion_ids = fvMap;

  result["Original Estimate"] = fmtSeconds(fields.timeoriginalestimate);
  result["Remaining Estimate"] = fmtSeconds(fields.timeestimate);

  result.Resolution = (fields.resolution && fields.resolution.name) || "";
  const subtasks = fields.subtasks;
  result.Subtasks = Array.isArray(subtasks)
    ? subtasks
        .filter(Boolean)
        .map((s) => s.key || "")
        .filter(Boolean)
        .join("; ")
    : "";

  appendUnmappedJiraFields(fields, result);

  return result;
}

const HARVEST_FIELDS = {
  "Issue Type": false,
  Status: false,
  Priority: false,
  Resolution: false,
  Assignee: false,
  Reporter: false,
  Sprint: false,
  "Fix Version": true,
  Labels: true,
  Components: false,
};

function normalizeOptionList(values) {
  const out = [];
  const seen = new Set();
  for (const raw of values || []) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function mergeOptionValues(options, fieldKey, values) {
  const cur = Array.isArray(options[fieldKey]) ? options[fieldKey] : [];
  const next = normalizeOptionList([...cur, ...(values || [])]);
  const changed = next.length !== cur.length || next.some((x, i) => x !== cur[i]);
  if (changed) options[fieldKey] = next;
  return changed;
}

function harvestOptionsFromTicket(ticket, metaOptions) {
  const opts = metaOptions;
  let changed = false;
  for (const [fieldName, isMulti] of Object.entries(HARVEST_FIELDS)) {
    const val = String(ticket[fieldName] || "").trim();
    if (!val) continue;
    const existing = new Set(opts[fieldName] || []);
    const parts = isMulti
      ? val.split(/[;,]/).map((p) => p.trim()).filter(Boolean)
      : [val];
    for (const p of parts) {
      if (p && !existing.has(p)) {
        existing.add(p);
        changed = true;
      }
    }
    opts[fieldName] = normalizeOptionList([...existing]);
  }
  return changed;
}


/* --- buildUpdate.js --- */
function parseDuration(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().toLowerCase();
  if (!s) return null;
  let total = 0;
  const dMatch = s.match(/(\d+)\s*d/);
  const hMatch = s.match(/(\d+)\s*h/);
  const mMatch = s.match(/(\d+)\s*m/);
  if (dMatch) total += Number(dMatch[1]) * 8 * 3600;
  if (hMatch) total += Number(hMatch[1]) * 3600;
  if (mMatch) total += Number(mMatch[1]) * 60;
  if (total === 0 && /^\d+$/.test(s)) total = Number(s);
  return total > 0 ? total : null;
}

function buildUpdateFieldsFromTicket(ticket) {
  const fields = {};
  if (ticket.Summary != null) fields.summary = String(ticket.Summary);

  const adf = ticket["Description ADF"];
  if (adf && typeof adf === "object" && adf.content) {
    // Sanitize before sending — Jira rejects media, smart cards, task lists, and other
    // read-only node types when they appear in a PUT payload, even if Jira sent them on GET.
    const clean = sanitizeAdfForUpdate(adf);
    if (clean) fields.description = clean;
  } else if (typeof adf === "string" && adf.trim()) {
    try {
      const parsed = JSON.parse(adf);
      if (parsed && parsed.content) {
        const clean = sanitizeAdfForUpdate(parsed);
        if (clean) fields.description = clean;
      }
    } catch {
      if (String(ticket.Description || "").trim()) {
        fields.description = textToAdf(ticket.Description);
      }
    }
  } else if (String(ticket.Description || "").trim()) {
    fields.description = textToAdf(ticket.Description);
  }

  const labelsRaw = ticket.Labels || "";
  fields.labels = labelsRaw
    ? String(labelsRaw).split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    : [];

  if (ticket.Priority) {
    fields.priority = { name: String(ticket.Priority).trim() };
  }

  if (ticket._assignee_accountId) {
    fields.assignee = { accountId: ticket._assignee_accountId };
  } else if (ticket.Assignee === "" || ticket.Assignee === null) {
    // Jira REST API v3 requires {accountId: null} to unassign — bare null is INVALID_INPUT.
    fields.assignee = { accountId: null };
  }

  const comps = String(ticket.Components || "").trim();
  fields.components = comps
    ? comps.split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((name) => ({ name }))
    : [];

  const fv = ticket["Fix Version"] || "";
  if (fv) {
    fields.fixVersions = String(fv)
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  } else {
    fields.fixVersions = [];
  }

  const env = ticket.Environment;
  if (env != null && String(env).trim()) {
    fields.environment = textToAdf(String(env));
  }

  // Time estimates — only send when present; many project configs restrict these fields.
  const origEst = parseDuration(ticket["Original Estimate"]);
  if (origEst != null) fields.timeoriginalestimate = origEst;

  const remEst = parseDuration(ticket["Remaining Estimate"]);
  if (remEst != null) fields.timeestimate = remEst;

  // Sprint — only send a valid positive integer ID to avoid INVALID_INPUT on archived sprints.
  const sprintId = Number(ticket._sprint_id);
  if (Number.isFinite(sprintId) && sprintId > 0) {
    fields.customfield_10020 = { id: sprintId };
  }

  // Epic link — customfield_10014 for classic projects, parent.key for next-gen.
  const epicKey = String(ticket["Epic Link"] || "").trim();
  if (epicKey) {
    if (ticket._epic_mode === "nextgen") {
      fields.parent = { key: epicKey };
    } else {
      fields.customfield_10014 = epicKey;
    }
  }

  // Parent issue key (sub-tasks / hierarchy).
  const parentKey = String(ticket["Parent key"] || ticket.Parent || "").trim();
  if (parentKey && ticket._epic_mode !== "nextgen") {
    fields.parent = { key: parentKey };
  }

  return fields;
}

function buildCreateFieldsFromTicket(ticket, projectKey) {
  const fields = {};
  fields.project = { key: projectKey || ticket["Project key"] || "SUNDANCE" };
  fields.summary = String(ticket.Summary || "New issue");
  fields.issuetype = { name: ticket["Issue Type"] || "Task" };

  const adf = ticket["Description ADF"];
  if (adf && typeof adf === "object" && adf.content) {
    const clean = sanitizeAdfForUpdate(adf);
    if (clean) fields.description = clean;
  } else if (String(ticket.Description || "").trim()) {
    fields.description = textToAdf(ticket.Description);
  }

  const labelsRaw = ticket.Labels || "";
  if (labelsRaw) {
    fields.labels = String(labelsRaw).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  }

  if (ticket.Priority) {
    fields.priority = { name: String(ticket.Priority).trim() };
  }

  if (ticket._assignee_accountId) {
    fields.assignee = { accountId: ticket._assignee_accountId };
  }

  const comps = ticket.Components || "";
  if (comps) {
    fields.components = String(comps).split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
  }

  const fv = ticket["Fix Version"] || "";
  if (fv) {
    fields.fixVersions = String(fv).split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
  }

  const env = ticket.Environment;
  if (env != null && String(env).trim()) {
    fields.environment = textToAdf(String(env));
  }

  // Match the update guard: only send a valid positive sprint ID.
  const sprintId = Number(ticket._sprint_id);
  if (Number.isFinite(sprintId) && sprintId > 0) {
    fields.customfield_10020 = { id: sprintId };
  }

  return fields;
}


/* --- storage.js --- */
function defaultTemplates() {
  return {
    "Default Task": {
      Summary: "[TASK] Short description",
      "Issue Type": "Task",
      Priority: "Medium",
      Assignee: "",
      Labels: "",
      Description: "",
    },
  };
}

function defaultMeta() {
  const options = {};
  for (const h of HEADERS) options[h] = [];
  return {
    options,
    jira: {},
    jira_option_catalog: null,
    fetched_issues: [],
    user_cache: {},
    folders: [],
    ticket_folders: {},
    auto_fetch_config: {
      enabled: false,
      scope: "assigned",
      project_key: "SUNDANCE",
      label_filter: [],
      label_mode: "any",
      component_filter: [],
      component_mode: "any",
      type_filter: [],
      status_filter: [],
      priority_filter: [],
      max_results: 0,
      folder_name: "",
      last_run_date: "",
    },
    internal_priorities: {},
    internal_priority_levels: ["High", "Medium", "Low", "None"],
    reminder_config: {
      High: { type: "daily" },
      Medium: { type: "weekly" },
      Low: { type: "on_open" },
      None: { type: "never" },
    },
    last_reminder: {},
    first_run_done: false,
    tutorial_enabled: true,
    welcome_updates: {},
    open_ticket_keys: [],
    welcome_show_high_priority: true,
    stale_ticket_enabled: false,
    stale_ticket_days: 14,
    stale_ticket_ignored_fields: [],
    blocked_status_names: ["Blocked"],
    blocked_reminder_config: { type: "daily" },
    reminder_single_popup: true,
    internal_priority_options: {},
    internal_priority_option_to_level: {},
    kanban_columns: null,
    bundle: [],
    /** Filled by sync: global /field + project createmeta for defaultProjectKey (e.g. Sundance). */
    jira_field_catalog: null,
  };
}

function loadBlob() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      debugLog("storage", "loadBlob: no saved blob (first run)");
      return { templates: defaultTemplates(), meta: defaultMeta() };
    }
    const data = JSON.parse(raw);
    const templates = data.templates && typeof data.templates === "object"
      ? data.templates
      : defaultTemplates();
    const meta = data.meta && typeof data.meta === "object"
      ? { ...defaultMeta(), ...data.meta }
      : defaultMeta();
    meta.options = { ...defaultMeta().options, ...(meta.options || {}) };
    for (const k of Object.keys(meta.options || {})) {
      meta.options[k] = normalizeOptionList(meta.options[k] || []);
    }
    const nIssues = Array.isArray(meta.fetched_issues)
      ? meta.fetched_issues.length
      : 0;
    debugLog("storage", "loadBlob", {
      bytes: raw.length,
      templateCount: Object.keys(templates).length,
      issueRows: nIssues,
    });
    return { templates, meta };
  } catch (e) {
    debugError("storage", "loadBlob failed, using defaults", e);
    return { templates: defaultTemplates(), meta: defaultMeta() };
  }
}

function saveBlob(templates, meta) {
  // Build a storage-optimised copy of meta — strip large redundant data before serialising.
  const metaToSave = { ...meta };

  // jira_option_catalog.options is a full duplicate of meta.options; strip it.
  if (metaToSave.jira_option_catalog && metaToSave.jira_option_catalog.options) {
    const { options: _drop, ...catalogMeta } = metaToSave.jira_option_catalog;
    metaToSave.jira_option_catalog = catalogMeta;
  }

  // jira_field_catalog.editMetaOptions is merged into meta.options during sync; strip it.
  // Also strip the `schema` blob from each fieldById entry — it's large and only needed at sync time.
  if (metaToSave.jira_field_catalog) {
    const { editMetaOptions: _emDrop, fieldById, ...catalogRest } = metaToSave.jira_field_catalog;
    const slimFieldById = {};
    for (const [id, fd] of Object.entries(fieldById || {})) {
      slimFieldById[id] = { name: fd.name, key: fd.key, custom: fd.custom, hasAllowedValues: fd.hasAllowedValues };
    }
    metaToSave.jira_field_catalog = { ...catalogRest, fieldById: slimFieldById };
  }

  // Cap Labels to 500 entries — 1000+ labels can push the blob over the 5 MB localStorage limit.
  if (metaToSave.options && Array.isArray(metaToSave.options.Labels) && metaToSave.options.Labels.length > 500) {
    metaToSave.options = { ...metaToSave.options, Labels: metaToSave.options.Labels.slice(0, 500) };
  }

  const payload = JSON.stringify({
    templates,
    meta: metaToSave,
    savedAt: new Date().toISOString(),
  });
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (e) {
    // If still over quota after trimming, drop the field catalog (it re-syncs on next load) and retry.
    if (e.name === "QuotaExceededError" || String(e).includes("quota")) {
      const { jira_field_catalog: _fc, jira_option_catalog: _oc, ...metaMin } = metaToSave;
      const fallback = JSON.stringify({ templates, meta: metaMin, savedAt: new Date().toISOString() });
      localStorage.setItem(STORAGE_KEY, fallback);
      debugWarn("storage", "saveBlob: quota exceeded — field/option catalog dropped, will re-sync on next load");
      return;
    }
    throw e;
  }
  debugLog("storage", "saveBlob", {
    bytes: payload.length,
    templateCount: Object.keys(templates || {}).length,
    issueRows: Array.isArray(meta?.fetched_issues) ? meta.fetched_issues.length : 0,
  });
}

function dedupListItems(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const k = String(it?.["Issue key"] || it?.["Issue id"] || "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}


/* --- jiraClient.js --- */
function parseHttpJsonResult(res, context) {
  if (!res) {
    debugError("http", "parseHttpJsonResult: empty res", context);
    throw new Error("Empty response from host");
  }
  const status = res.status ?? res.statusCode ?? 200;
  const body = res.body ?? res.data ?? res.json;
  let data = body;
  if (typeof body === "string") {
    try {
      data = body ? JSON.parse(body) : null;
    } catch (e) {
      debugError("http", "parseHttpJsonResult: JSON parse failed", context, {
        status,
        bodyPreview: (body || "").slice(0, 400),
      });
      const err = new Error(`Invalid JSON (${status})`);
      err.raw = body;
      throw err;
    }
  }
  if (status === 204) {
    return null;
  }
  if (status >= 400) {
    debugWarn("http", "parseHttpJsonResult: HTTP error", context, {
      status,
      dataPreview:
        typeof data === "object" && data
          ? JSON.stringify(data).slice(0, 800)
          : String(data).slice(0, 400),
    });
    const err = new Error(
      typeof data === "object" && data && data.errorMessages
        ? JSON.stringify(data.errorMessages)
        : `HTTP ${status}`,
    );
    err.status = status;
    err.data = data;
    throw err;
  }
  return data;
}

function utf8ToBase64(str) {
  if (typeof btoa !== "undefined") {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8").toString("base64");
  }
  throw new Error("No base64 encoder available");
}

function authHeader(email, token) {
  const raw = `${email}:${token}`;
  return `Basic ${utf8ToBase64(raw)}`;
}

/**
 * Safely extract an array from a Jira API response.
 * Handles both plain arrays and page beans ({ values: [...] }).
 * The `key` param lets callers specify an alternative property name (e.g. "issueTypes", "fields").
 *
 * IMPORTANT: Arrays have a built-in Array.prototype.values method, so `page.values` is always
 * truthy when page is an array — a plain `(page && page.values) || []` pattern resolves to the
 * function, not the array.  This helper avoids that trap.
 */
function pageVals(page, key = "values") {
  if (Array.isArray(page)) return page;
  if (page && Array.isArray(page[key])) return page[key];
  if (key !== "values" && page && Array.isArray(page.values)) return page.values;
  return [];
}

function createJiraClient(api, { baseUrl, email, token }) {
  if (!api || typeof api.httpRequestJson !== "function") {
    debugWarn(
      "jira",
      "createJiraClient: host API missing httpRequestJson — cannot call Jira",
    );
    return null;
  }
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base || !email || !token) {
    debugLog("jira", "createJiraClient: incomplete config", {
      hasBase: !!base,
      hasEmail: !!email,
      hasToken: !!token,
      basePreview: base ? safeUrl(base) : "",
    });
    return null;
  }
  debugLog("jira", "createJiraClient: ready", { base: safeUrl(base) });

  async function req(method, path, { query, jsonBody } = {}) {
    let url = path.startsWith("http") ? path : `${base}${path}`;
    if (query && typeof query === "object") {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) q.set(k, String(v));
      }
      const s = q.toString();
      if (s) url += (url.includes("?") ? "&" : "?") + s;
    }
    const pathLabel = url.startsWith(base) ? url.slice(base.length) : url;
    const ctx = { method, path: pathLabel, url: safeUrl(url) };
    debugLog("http", "request", ctx);
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(email, token),
    };
    let res;
    try {
      res = await api.httpRequestJson({
        url,
        method,
        headers,
        body:
          jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
      });
    } catch (e) {
      debugError("http", "httpRequestJson threw", ctx, e);
      throw e;
    }
    const st = res?.status ?? res?.statusCode;
    const resKeys =
      res && typeof res === "object" && !Array.isArray(res)
        ? Object.keys(res)
        : [];
    debugLog("http", "response", {
      ...ctx,
      status: st,
      bodyType: typeof (res?.body ?? res?.data ?? res?.json),
      responseKeys: resKeys,
    });
    return parseHttpJsonResult(res, ctx);
  }

  return {
    base,

    async myself() {
      for (const ver of ["3", "2"]) {
        try {
          const data = await req("GET", `/rest/api/${ver}/myself`);
          if (data) {
            debugLog("jira", "/myself ok", { api: ver });
            return data;
          }
        } catch (e) {
          debugWarn("jira", `/myself failed (api ${ver})`, e?.message || e);
        }
      }
      debugError("jira", "/myself: all attempts failed");
      throw new Error("Could not load /myself");
    },

    async fetchIssue(issueKeyOrId, fieldsList = FETCH_ISSUE_FIELDS_ALL) {
      const fieldsParam = Array.isArray(fieldsList) ? fieldsList.join(",") : fieldsList;
      const path = `/rest/api/3/issue/${encodeURIComponent(issueKeyOrId)}`;
      const data = await req("GET", path, {
        query: { fields: fieldsParam, expand: "renderedFields" },
      });
      return data;
    },

    async searchJql(jql, maxResults = 50, excludeKeys = null, nextPageToken = null) {
      const body = {
        jql,
        maxResults: Math.min(Math.max(1, Number(maxResults) || 50), 100),
      };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      if (excludeKeys && excludeKeys.length && excludeKeys.length <= 100) {
        const quoted = excludeKeys.map((k) => `"${k}"`).join(", ");
        const upper = jql.toUpperCase();
        const notIn = ` AND key NOT IN (${quoted})`;
        if (upper.includes(" ORDER BY ")) {
          const i = upper.indexOf(" ORDER BY ");
          body.jql = jql.slice(0, i) + notIn + jql.slice(i);
        } else {
          body.jql = jql + notIn;
        }
      }
      return req("POST", "/rest/api/3/search/jql", { jsonBody: body });
    },

    /**
     * Paginated JQL (100/issue page). maxTotal 0 / undefined = no cap (fetch every matching issue).
     */
    async searchJqlAll(jql, options = {}) {
      const maxTotalOpt = options.maxTotal;
      const unlimited =
        maxTotalOpt === 0 || maxTotalOpt === undefined || maxTotalOpt === null;
      const cap = unlimited ? Infinity : Math.max(1, Number(maxTotalOpt));
      const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 100));
      const onProgress = options.onProgress;
      const excludeKeys = options.excludeKeys;
      let jqlEff = jql;
      if (excludeKeys && excludeKeys.length && excludeKeys.length <= 100) {
        const quoted = excludeKeys.map((k) => `"${k}"`).join(", ");
        const upper = jqlEff.toUpperCase();
        const notIn = ` AND key NOT IN (${quoted})`;
        if (upper.includes(" ORDER BY ")) {
          const i = upper.indexOf(" ORDER BY ");
          jqlEff = jqlEff.slice(0, i) + notIn + jqlEff.slice(i);
        } else {
          jqlEff = jqlEff + notIn;
        }
      }
      const issues = [];
      let nextPageToken = null;
      let page = 0;
      while (true) {
        const body = { jql: jqlEff, maxResults: pageSize };
        if (nextPageToken) body.nextPageToken = nextPageToken;
        const sr = await req("POST", "/rest/api/3/search/jql", { jsonBody: body });
        const batch = (sr && sr.issues) || [];
        page += 1;
        for (let i = 0; i < batch.length; i++) {
          issues.push(batch[i]);
          if (issues.length >= cap) {
            if (onProgress) onProgress({ page, batchSize: batch.length, total: issues.length, isLast: true, truncated: true });
            return { issues, pages: page, truncated: true };
          }
        }
        if (onProgress) onProgress({ page, batchSize: batch.length, total: issues.length, isLast: !!sr.isLast });
        nextPageToken = sr.nextPageToken || null;
        const done =
          sr.isLast === true ||
          !nextPageToken ||
          batch.length === 0;
        if (done) break;
      }
      return { issues, pages: page, truncated: false };
    },

    async updateIssue(issueKey, fieldsPayload) {
      return req("PUT", `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
        jsonBody: { fields: fieldsPayload },
      });
    },

    async createIssue(fieldsPayload) {
      return req("POST", "/rest/api/3/issue", {
        jsonBody: { fields: fieldsPayload },
      });
    },

    async getTransitions(issueKey) {
      const data = await req("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
      return (data && data.transitions) || [];
    },

    async doTransition(issueKey, transitionId) {
      return req("POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
        jsonBody: { transition: { id: String(transitionId) } },
      });
    },

    async addComment(issueKey, adfBody) {
      return req("POST", `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
        jsonBody: { body: adfBody },
      });
    },

    async getIssueEditMeta(issueKey) {
      const key = String(issueKey || "").trim();
      if (!key) throw new Error("Issue key required");
      return req("GET", `/rest/api/3/issue/${encodeURIComponent(key)}/editmeta`);
    },

    async searchUsers(query, maxResults = 20) {
      return req("GET", "/rest/api/3/user/search", {
        query: { query, maxResults },
      });
    },

    async getBoards(projectKey) {
      const data = await req("GET", "/rest/agile/1.0/board", {
        query: { projectKeyOrId: projectKey, maxResults: 50 },
      });
      return pageVals(data);
    },

    async getBoardSprints(boardId, states = "active,future") {
      const data = await req("GET", `/rest/agile/1.0/board/${boardId}/sprint`, {
        query: { state: states, maxResults: 200 },
      });
      return pageVals(data);
    },

    /** All fields in the Jira site (names, ids). Paginates when the API returns paged JSON. */
    async listAllFields() {
      const first = await req("GET", "/rest/api/3/field");
      if (Array.isArray(first)) return first;
      const values = (first && first.values) || [];
      const total = typeof first.total === "number" ? first.total : values.length;
      if (values.length >= total || !values.length) return values;
      const all = [...values];
      let startAt = values.length;
      while (all.length < total) {
        const page = await req("GET", "/rest/api/3/field", {
          query: { startAt, maxResults: 1000 },
        });
        const chunk = Array.isArray(page) ? page : (page && page.values) || [];
        if (!chunk.length) break;
        all.push(...chunk);
        if (chunk.length < 1000) break;
        startAt += chunk.length;
      }
      return all;
    },

    /** Fields available on the project (union across issue types), Sundance etc. */
    async getCreateMetaForProject(projectKey) {
      const pk = String(projectKey || "").trim();
      if (!pk) throw new Error("Project key required");
      return req("GET", "/rest/api/3/issue/createmeta", {
        query: { projectKeys: pk, expand: "projects.issuetypes.fields" },
      });
    },

    async getProject(projectKey) {
      const pk = String(projectKey || "").trim();
      if (!pk) throw new Error("Project key required");
      return req("GET", `/rest/api/3/project/${encodeURIComponent(pk)}`);
    },

    async listPriorities() {
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", "/rest/api/3/priority/search", {
          query: { startAt, maxResults: 1000 },
        });
        const vals = pageVals(page);
        out.push(...vals);
        if (!vals.length || page.isLast === true || !page.nextPage) break;
        startAt += vals.length;
      }
      return out;
    },

    /** All resolutions. Tries /resolution/search (paginated) then falls back to /resolution (flat array). */
    async listResolutions() {
      try {
        const out = [];
        let startAt = 0;
        while (true) {
          const page = await req("GET", "/rest/api/3/resolution/search", {
            query: { startAt, maxResults: 1000 },
          });
          const vals = pageVals(page);
          out.push(...vals);
          if (!vals.length || page.isLast === true || !page.nextPage) break;
          startAt += vals.length;
        }
        return out;
      } catch {
        const data = await req("GET", "/rest/api/3/resolution");
        return pageVals(data);
      }
    },

    async listProjectStatuses(projectKey) {
      const pk = String(projectKey || "").trim();
      if (!pk) return [];
      const data = await req("GET", `/rest/api/3/project/${encodeURIComponent(pk)}/statuses`);
      return Array.isArray(data) ? data : [];
    },

    async listProjectComponents(projectKey) {
      const pk = String(projectKey || "").trim();
      if (!pk) return [];
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", `/rest/api/3/project/${encodeURIComponent(pk)}/components`, {
          query: { startAt, maxResults: 1000 },
        });
        const vals = pageVals(page);
        out.push(...vals);
        if (Array.isArray(page) || !vals.length || page.isLast === true || !page.nextPage) break;
        startAt += vals.length;
      }
      return out;
    },

    async listProjectVersions(projectKey) {
      const pk = String(projectKey || "").trim();
      if (!pk) return [];
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", `/rest/api/3/project/${encodeURIComponent(pk)}/versions`, {
          query: { startAt, maxResults: 1000 },
        });
        const vals = pageVals(page);
        out.push(...vals);
        if (Array.isArray(page) || !vals.length || page.isLast === true || !page.nextPage) break;
        startAt += vals.length;
      }
      return out;
    },

    /** Issue types available for a specific project, by numeric project ID. */
    async listProjectIssueTypes(projectId) {
      const pid = Number(projectId);
      if (!Number.isFinite(pid)) return [];
      const data = await req("GET", "/rest/api/3/issuetype/project", {
        query: { projectId: pid },
      });
      return pageVals(data);
    },

    async listLabels() {
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", "/rest/api/3/label", {
          query: { startAt, maxResults: 1000 },
        });
        const vals = pageVals(page);
        out.push(...vals);
        if (!vals.length || page.isLast === true || !page.nextPage) break;
        startAt += vals.length;
      }
      return out;
    },

    /** Field definitions visible on a project via /field/search?projectIds=. */
    async listFieldsForProject(projectId) {
      const pid = Number(projectId);
      if (!Number.isFinite(pid)) return [];
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", "/rest/api/3/field/search", {
          query: { projectIds: pid, startAt, maxResults: 1000 },
        });
        const vals = pageVals(page);
        out.push(...vals);
        if (!vals.length || page.isLast === true) break;
        startAt += vals.length;
      }
      return out;
    },

    /**
     * New Jira Cloud paginated createmeta — issue types for a project.
     * Replaces the deprecated expand=projects.issuetypes.fields approach.
     */
    async listCreateMetaIssueTypes(projectKey) {
      const pk = String(projectKey || "").trim();
      if (!pk) return [];
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", `/rest/api/3/issue/createmeta/${encodeURIComponent(pk)}/issuetypes`, {
          query: { startAt, maxResults: 50 },
        });
        const vals = pageVals(page, "issueTypes");
        out.push(...vals);
        const total = typeof page.total === "number" ? page.total : out.length;
        if (!vals.length || out.length >= total) break;
        startAt += vals.length;
      }
      return out;
    },

    /**
     * New Jira Cloud paginated createmeta — all fields (with allowedValues) for one issue type.
     * issueTypeId can be the numeric id or name string.
     */
    async listCreateMetaFields(projectKey, issueTypeId) {
      const pk = String(projectKey || "").trim();
      if (!pk || !issueTypeId) return [];
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", `/rest/api/3/issue/createmeta/${encodeURIComponent(pk)}/fields`, {
          query: { issueTypeId: String(issueTypeId), startAt, maxResults: 100 },
        });
        const vals = pageVals(page, "fields");
        out.push(...vals);
        const total = typeof page.total === "number" ? page.total : out.length;
        if (!vals.length || out.length >= total) break;
        startAt += vals.length;
      }
      return out;
    },

    /**
     * Project work type fields via /projects/fields.
     * workTypeId is Jira work type / issue type id.
     */
    async listProjectFieldsForWorkType(projectId, workTypeId) {
      const pid = Number(projectId);
      const wid = Number(workTypeId);
      if (!Number.isFinite(pid) || !Number.isFinite(wid)) return [];
      const out = [];
      let startAt = 0;
      while (true) {
        const page = await req("GET", "/rest/api/3/projects/fields", {
          query: { projectId: pid, workTypeId: wid, startAt, maxResults: 1000 },
        });
        const vals = (page && page.values) || [];
        out.push(...vals);
        if (!vals.length || page.isLast === true) break;
        startAt += vals.length;
      }
      return out;
    },

    mapToRow(issueJson, base) {
      return mapIssueJsonToDict(issueJson, base);
    },

    harvest(ticket, metaOptions) {
      return harvestOptionsFromTicket(ticket, metaOptions);
    },
  };
}

function interopPublish(api, topic, event, payload) {
  if (!api || typeof api.interopPublish !== "function") return;
  try {
    api.interopPublish({
      channel: `${EXTENSION_ID}/${topic}/${event}`,
      payload,
      source: EXTENSION_ID,
      target: "*",
    });
  } catch {
    /* ignore */
  }
}

function analyticsTrack(api, event, payload) {
  if (!api || typeof api.analyticsTrack !== "function") return;
  try {
    api.analyticsTrack({ event: `avalanche_jira_${event}`, payload });
  } catch {
    /* ignore */
  }
}


/* --- AvalancheMain.jsx (body) --- */
/* ---- Theme tokens ---- */
const T = {
  surface: "var(--hp-surface, #FDF6E3)",
  card: "var(--hp-card, #FFFBF0)",
  border: "var(--hp-border, #D4A574)",
  text: "var(--hp-text, #3B1010)",
  muted: "var(--hp-muted, #8B6B5B)",
  accent: "var(--hp-accent, #D3A625)",
  accentLight: "var(--hp-accent-light, #E8D48B)",
  primary: "var(--hp-primary, #740001)",
  heading: "'Cinzel', serif",
  body: "'Crimson Text', serif",
  mono: "monospace",
};

const inputStyle = {
  width: "100%", padding: "6px 10px", fontSize: 13, fontFamily: T.body,
  borderRadius: 4, border: "1px solid " + T.border, background: T.card,
  color: T.text, outline: "none", boxSizing: "border-box",
};
const textareaStyle = { ...inputStyle, minHeight: 96, resize: "vertical", fontFamily: T.mono, fontSize: 12, lineHeight: 1.6 };
const selectStyle = { ...inputStyle, cursor: "pointer" };
const labelSt = { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted };
const radioLabelSt = { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.text, cursor: "pointer" };

const CONFIG_OVERLAY = "avalanche-jira-config-overlay";

/* ---- Shared components ---- */

function ActionButton({ label, onClick, accent, danger, small, disabled, title }) {
  const bg = danger ? "rgba(180,60,60,0.15)" : accent ? "rgba(211,166,37,0.15)" : "rgba(120,120,120,0.1)";
  const color = danger ? "#E07070" : accent ? T.accent : T.muted;
  const borderC = danger ? "rgba(180,60,60,0.4)" : accent ? "rgba(211,166,37,0.4)" : "rgba(120,120,120,0.25)";
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      style={{ padding: small ? "3px 8px" : "6px 14px", fontSize: small ? 10 : 12, fontWeight: 600,
        background: bg, color, border: "1px solid " + borderC, borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        fontFamily: T.body, whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

function SectionCard({ title, accent: accentTint, children }) {
  return (
    <div style={{ borderRadius: 8, border: "1px solid " + T.border, overflow: "hidden" }}>
      {title && (
        <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, fontFamily: T.body,
          textTransform: "uppercase", letterSpacing: "0.06em", color: accentTint || T.muted,
          borderBottom: "1px solid " + T.border, background: accentTint ? "rgba(211,166,37,0.06)" : "transparent" }}>
          {title}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

function TicketRow({ label, onDoubleClick }) {
  return (
    <li style={{ padding: "6px 12px", fontSize: 12, fontFamily: T.body, color: T.text, cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.04)" }}
      onDoubleClick={onDoubleClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(211,166,37,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      {label}
    </li>
  );
}

/* ---- ComboBox ---- */

function ComboBox({ value, onChange, options, placeholder, disabled, style: extra }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);
  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return (options || []).slice(0, 100);
    return (options || []).filter((o) => String(o).toLowerCase().includes(q)).slice(0, 100);
  }, [options, filter]);
  useEffect(() => {
    if (!open) { setFilter(""); return; }
    if (searchRef.current) searchRef.current.focus();
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", ...extra }}>
      {/* Trigger — shows the selected value, not an editable input */}
      <div
        style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: disabled ? "default" : "pointer", userSelect: "none", opacity: disabled ? 0.55 : 1 }}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
      >
        <span style={{ fontSize: 12, color: value ? T.text : T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder || <span style={{ fontStyle: "italic" }}>—</span>}
        </span>
        <span style={{ color: T.muted, fontSize: 9, marginLeft: 6, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
          border: "1px solid " + T.border, borderRadius: "0 0 4px 4px",
          background: T.card, boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}>
          <div style={{ padding: "4px 8px", borderBottom: "1px solid " + T.border }}>
            <input ref={searchRef}
              style={{ width: "100%", border: "none", outline: "none", background: "transparent",
                fontSize: 12, fontFamily: T.body, color: T.text, padding: "2px 0" }}
              placeholder="Search…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)} />
          </div>
          <ul style={{ maxHeight: 200, overflowY: "auto", margin: 0, padding: 0, listStyle: "none" }}>
            {value && (
              <li style={{ padding: "5px 10px", fontSize: 11, cursor: "pointer", color: T.muted, fontStyle: "italic",
                borderBottom: "1px solid " + T.border }}
                onMouseDown={(e) => { e.preventDefault(); onChange(""); setOpen(false); }}>
                — Clear selection —
              </li>
            )}
            {filtered.map((opt) => (
              <li key={opt}
                style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer",
                  color: opt === value ? T.accent : T.text,
                  background: opt === value ? "rgba(211,166,37,0.12)" : "transparent",
                  fontWeight: opt === value ? 600 : 400,
                  display: "flex", alignItems: "center", gap: 6 }}
                onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(211,166,37,0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = opt === value ? "rgba(211,166,37,0.12)" : "transparent"; }}>
                <span style={{ width: 12, flexShrink: 0, color: T.accent, fontSize: 10 }}>{opt === value ? "✓" : ""}</span>
                {opt}
              </li>
            ))}
            {filtered.length === 0 && (
              <li style={{ padding: "8px 10px", fontSize: 11, color: T.muted, fontStyle: "italic" }}>No options found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---- MultiSelect ---- */

function MultiSelect({ value, onChange, options, placeholder }) {
  const tags = useMemo(() => String(value || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean), [value]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef(null);
  const tagSet = useMemo(() => new Set(tags.map((t) => t.toLowerCase())), [tags]);
  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return (options || []).filter((o) => {
      const low = String(o).toLowerCase();
      return !tagSet.has(low) && (!q || low.includes(q));
    }).slice(0, 40);
  }, [options, filter, tagSet]);
  useEffect(() => {
    if (!open) return;
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const addTag = (t) => { onChange([...tags, t].join("; ")); };
  const removeTag = (idx) => { onChange(tags.filter((_, i) => i !== idx).join("; ")); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ ...inputStyle, display: "flex", flexWrap: "wrap", gap: 4, padding: "4px 6px", minHeight: 32, cursor: "text" }}
        onClick={() => setOpen(true)}>
        {tags.map((t, i) => (
          <span key={t + i} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px",
            fontSize: 11, borderRadius: 3, background: "rgba(211,166,37,0.15)", color: T.accent, border: "1px solid rgba(211,166,37,0.3)" }}>
            {t}
            <span style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, lineHeight: 1 }}
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}>{"×"}</span>
          </span>
        ))}
        <input style={{ border: "none", outline: "none", background: "transparent", flex: 1, minWidth: 60,
          fontSize: 12, fontFamily: T.body, color: T.text, padding: "2px 0" }}
          placeholder={tags.length === 0 ? placeholder : ""}
          value={filter} onChange={(e) => { setFilter(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} />
      </div>
      {open && filtered.length > 0 && (
        <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          maxHeight: 160, overflowY: "auto", margin: 0, padding: 0, listStyle: "none",
          border: "1px solid " + T.border, borderRadius: "0 0 4px 4px", background: T.card, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {filtered.map((opt) => (
            <li key={opt} style={{ padding: "5px 10px", fontSize: 12, cursor: "pointer", color: T.text }}
              onMouseDown={(e) => { e.preventDefault(); addTag(opt); setFilter(""); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(211,166,37,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- FilterMultiSelect (for fetch dialog: shows selected + Choose button) ---- */

function FilterMultiSelect({ label, value, onChange, options, matchMode, onMatchModeChange }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => (value || []).filter(Boolean), [value]);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt));
    else onChange([...selected, opt]);
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={labelSt}>{label} (optional):</span>
      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
        <div style={{ ...inputStyle, flex: 1, fontSize: 11, color: selected.length ? T.text : T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected.length ? selected.join(", ") : "None selected"}
        </div>
        <div ref={ref} style={{ position: "relative" }}>
          <ActionButton label="Choose..." small onClick={() => setOpen(!open)} />
          {open && (
            <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 30, width: 240, maxHeight: 200,
              overflowY: "auto", border: "1px solid " + T.border, borderRadius: 6, background: T.card,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)", padding: 6 }}>
              {(options || []).map((opt) => (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", fontSize: 11, cursor: "pointer", color: T.text }}>
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: T.accent }} />
                  {opt}
                </label>
              ))}
              {(!options || options.length === 0) && <div style={{ fontSize: 11, color: T.muted, padding: 6 }}>No options available</div>}
            </div>
          )}
        </div>
      </div>
      {matchMode !== undefined && onMatchModeChange && selected.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Match:</span>
          <label style={radioLabelSt}><input type="radio" checked={matchMode === "any"} onChange={() => onMatchModeChange("any")} style={{ accentColor: T.accent }} /> At least one (OR)</label>
          <label style={radioLabelSt}><input type="radio" checked={matchMode === "all"} onChange={() => onMatchModeChange("all")} style={{ accentColor: T.accent }} /> All selected (AND)</label>
        </div>
      )}
    </div>
  );
}

/* ---- Rich Text Editor (preview + edit toggle, matching original Python app) ---- */

function RichEditor({ adf, renderedHtml, onChange }) {
  const editorRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const styledHtml = useMemo(() => adfToHtml(adf), [adf]);
  // Jira's renderedFields.description is often plain/wiki text, not real HTML; injecting it breaks tables.
  // Match edit mode: when we have ADF, always use the same adfToHtml() output for preview.
  const previewHtml = hasAdfDescription(adf) ? styledHtml : renderedHtml || styledHtml;
  useEffect(() => { setEditorReady(false); }, [adf]);
  useEffect(() => {
    if (editing && editorRef.current && !editorReady) { editorRef.current.innerHTML = styledHtml; setEditorReady(true); }
  }, [editing, styledHtml, editorReady]);
  const exec = (cmd, val) => { document.execCommand(cmd, false, val || null); editorRef.current?.focus(); };
  const syncAdf = () => { if (!editorRef.current) return; onChange(htmlToAdf(editorRef.current.innerHTML)); };
  const insertTable = () => {
    var tHtml = '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0 16px 0">'
      + '<tr><th style="border:1px solid var(--hp-border,#555);padding:8px 10px;background:rgba(211,166,37,0.15);font-weight:bold">Header</th>'
      + '<th style="border:1px solid var(--hp-border,#555);padding:8px 10px;background:rgba(211,166,37,0.15);font-weight:bold">Header</th>'
      + '<th style="border:1px solid var(--hp-border,#555);padding:8px 10px;background:rgba(211,166,37,0.15);font-weight:bold">Header</th></tr>'
      + '<tr><td style="border:1px solid var(--hp-border,#555);padding:8px 10px">&nbsp;</td>'
      + '<td style="border:1px solid var(--hp-border,#555);padding:8px 10px">&nbsp;</td>'
      + '<td style="border:1px solid var(--hp-border,#555);padding:8px 10px">&nbsp;</td></tr>'
      + '<tr><td style="border:1px solid var(--hp-border,#555);padding:8px 10px">&nbsp;</td>'
      + '<td style="border:1px solid var(--hp-border,#555);padding:8px 10px">&nbsp;</td>'
      + '<td style="border:1px solid var(--hp-border,#555);padding:8px 10px">&nbsp;</td></tr>'
      + '</table><p>&nbsp;</p>';
    exec("insertHTML", tHtml);
  };
  const insertLink = () => { const url = prompt("Enter URL:"); if (url) exec("createLink", url); };
  const tbBtn = (lbl, cmd, val) => (
    <button type="button" key={lbl}
      style={{ padding: "2px 6px", fontSize: 11, fontFamily: T.mono, background: "rgba(120,120,120,0.1)",
        border: "1px solid rgba(120,120,120,0.2)", borderRadius: 3, cursor: "pointer", color: T.text }}
      onMouseDown={(e) => { e.preventDefault(); if (cmd === "insertTable") insertTable(); else if (cmd === "createLink") insertLink(); else exec(cmd, val); }}>
      {lbl}
    </button>
  );
  if (!editing) {
    return (
      <div style={{ border: "1px solid " + T.border, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderBottom: "1px solid " + T.border, background: "rgba(0,0,0,0.03)" }}>
          <span style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Preview</span>
          <ActionButton label="Edit" small onClick={() => { setEditing(true); setEditorReady(false); }} />
        </div>
        <div style={{ minHeight: 80, maxHeight: 500, overflowY: "auto", padding: "10px 12px",
          fontSize: 13, fontFamily: T.body, color: T.text, background: T.card, lineHeight: 1.6, wordBreak: "break-word" }}
          dangerouslySetInnerHTML={{ __html: previewHtml || '<p style="color:var(--hp-muted,#8B6B5B)">No description</p>' }} />
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid " + T.border, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "4px 6px", borderBottom: "1px solid " + T.border, background: "rgba(0,0,0,0.03)", alignItems: "center" }}>
        {tbBtn("B", "bold")}{tbBtn("I", "italic")}{tbBtn("U", "underline")}{tbBtn("S", "strikeThrough")}
        {tbBtn("H1", "formatBlock", "h1")}{tbBtn("H2", "formatBlock", "h2")}{tbBtn("H3", "formatBlock", "h3")}
        {tbBtn("*", "insertUnorderedList")}{tbBtn("1.", "insertOrderedList")}
        {tbBtn("Code", "formatBlock", "pre")}{tbBtn("Quote", "formatBlock", "blockquote")}
        {tbBtn("Link", "createLink")}{tbBtn("Table", "insertTable")}{tbBtn("HR", "insertHorizontalRule")}
        <span style={{ marginLeft: "auto" }} />
        <ActionButton label="Done" small accent onClick={() => { syncAdf(); setEditing(false); }} />
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning onBlur={syncAdf}
        style={{ minHeight: 200, maxHeight: 500, overflowY: "auto", padding: "10px 12px",
          fontSize: 13, fontFamily: T.body, color: T.text, background: T.card, outline: "none",
          lineHeight: 1.6, wordBreak: "break-word" }} />
    </div>
  );
}

/* ---- Comment Thread ---- */

function CommentThread({ commentsJson, issueKey, client, onRefresh, busy }) {
  const comments = useMemo(() => { try { return JSON.parse(commentsJson || "[]"); } catch { return []; } }, [commentsJson]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const postComment = async () => {
    if (!newComment.trim() || !client || !issueKey) return;
    setPosting(true);
    try { await client.addComment(issueKey, textToAdf(newComment.trim())); setNewComment(""); if (onRefresh) await onRefresh(); }
    catch (e) { debugError("view", "postComment failed", e); }
    finally { setPosting(false); }
  };
  return (
    <div style={{ borderTop: "1px solid " + T.border, paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}
        onClick={() => setExpanded(!expanded)}>
        <span style={{ ...labelSt, fontSize: 11 }}>Comments ({comments.length})</span>
        <span style={{ fontSize: 10, color: T.muted }}>{expanded ? "^" : "v"}</span>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {comments.length === 0 && <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>No comments</p>}
          {comments.map((c, i) => (
            <div key={c.id || i} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)", background: "rgba(211,166,37,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.accent }}>{c.author}</span>
                <span style={{ fontSize: 10, color: T.muted }}>{c.date ? new Date(c.date).toLocaleDateString() : ""}</span>
              </div>
              <div style={{ fontSize: 12, color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea style={{ ...inputStyle, minHeight: 48, resize: "vertical", flex: 1, fontSize: 12 }}
              placeholder="Add a comment..." value={newComment} onChange={(e) => setNewComment(e.target.value)} />
            <ActionButton label="Post" accent small disabled={posting || busy || !newComment.trim()} onClick={postComment} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Mass Edit Dialog ---- */

const MASS_EDIT_FIELDS = [
  { label: "Summary", key: "Summary", type: "text" },
  { label: "Priority", key: "Priority", type: "select" },
  { label: "Labels", key: "Labels", type: "multi" },
  { label: "Components", key: "Components", type: "multi" },
  { label: "Assignee", key: "Assignee", type: "select" },
  { label: "Status", key: "Status", type: "transition" },
  { label: "Sprint", key: "Sprint", type: "select" },
  { label: "Fix Version", key: "Fix Version", type: "select" },
];

function MassEditDialog({ selectedKeys, listItems, meta, client, onClose, onDone, busy: parentBusy }) {
  const [field, setField] = useState(MASS_EDIT_FIELDS[0]);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("replace");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const options = useMemo(() => (meta.options && meta.options[field.key]) || [], [meta, field]);
  const isMulti = field.type === "multi";
  const apply = async () => {
    if (!client || selectedKeys.size === 0) return;
    setRunning(true);
    const results = [];
    for (const key of selectedKeys) {
      const ticket = listItems.find((it) => (it["Issue key"] || it["Issue id"]) === key);
      if (!ticket) continue;
      try {
        if (field.type === "transition") {
          const transitions = await client.getTransitions(key);
          const match = transitions.find((tr) => tr.name.toLowerCase() === value.toLowerCase());
          if (!match) { results.push({ key, ok: false, msg: "No transition to '" + value + "'" }); continue; }
          await client.doTransition(key, match.id);
          results.push({ key, ok: true, msg: "Transitioned to " + value });
        } else {
          const payload = {};
          if (field.key === "Summary") { payload.summary = value; }
          else if (field.key === "Priority") { payload.priority = { name: value }; }
          else if (field.key === "Labels" || field.key === "Components") {
            const newVals = value.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
            const jiraField = field.key === "Labels" ? "labels" : "components";
            if (mode === "replace") { payload[jiraField] = jiraField === "labels" ? newVals : newVals.map((n) => ({ name: n })); }
            else {
              const existing = String(ticket[field.key] || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
              let merged;
              if (mode === "add") { const set = new Set(existing.map((e) => e.toLowerCase())); merged = [...existing]; for (const v of newVals) { if (!set.has(v.toLowerCase())) { merged.push(v); set.add(v.toLowerCase()); } } }
              else { const removeSet = new Set(newVals.map((v) => v.toLowerCase())); merged = existing.filter((e) => !removeSet.has(e.toLowerCase())); }
              payload[jiraField] = jiraField === "labels" ? merged : merged.map((n) => ({ name: n }));
            }
          } else if (field.key === "Assignee") {
            const users = await client.searchUsers(value, 5);
            const match = users.find((u) => (u.displayName || "").toLowerCase() === value.toLowerCase());
            if (match) payload.assignee = { accountId: match.accountId };
            else { results.push({ key, ok: false, msg: "User '" + value + "' not found" }); continue; }
          } else if (field.key === "Fix Version") {
            payload.fixVersions = value.split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((n) => ({ name: n }));
          }
          await client.updateIssue(key, payload);
          results.push({ key, ok: true, msg: "Updated" });
        }
      } catch (e) { results.push({ key, ok: false, msg: String(e.message || e) }); }
    }
    setLog(results); setRunning(false);
    if (results.every((r) => r.ok) && onDone) onDone();
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", borderRadius: 10, border: "1px solid " + T.border, background: T.card, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
        <h3 style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 600, color: T.text, margin: "0 0 6px" }}>Mass Edit</h3>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>{selectedKeys.size} issue(s) selected</p>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={labelSt}>Field</span>
          <select style={{ ...selectStyle, marginTop: 4 }} value={field.key}
            onChange={(e) => { setField(MASS_EDIT_FIELDS.find((f) => f.key === e.target.value) || MASS_EDIT_FIELDS[0]); setValue(""); setMode("replace"); }}>
            {MASS_EDIT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        {isMulti && (
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            {["replace", "add", "remove"].map((m) => (
              <label key={m} style={radioLabelSt}>
                <input type="radio" name="massMode" checked={mode === m} onChange={() => setMode(m)} style={{ accentColor: T.accent }} />
                {m === "replace" ? "Replace" : m === "add" ? "Add to existing" : "Remove from existing"}
              </label>
            ))}
          </div>
        )}
        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={labelSt}>Value</span>
          {field.type === "text" ? <input style={{ ...inputStyle, marginTop: 4 }} value={value} onChange={(e) => setValue(e.target.value)} />
            : <ComboBox value={value} onChange={setValue} options={options} placeholder={"Enter " + field.label + "..."} style={{ marginTop: 4 }} />}
        </label>
        {log.length > 0 && (
          <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 10, fontSize: 11, fontFamily: T.mono }}>
            {log.map((r, i) => <div key={i} style={{ color: r.ok ? "#4AE08A" : "#E07070", padding: "2px 0" }}>{r.key}: {r.msg}</div>)}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <ActionButton label="Cancel" onClick={onClose} />
          <ActionButton label={running ? "Applying..." : "Apply"} accent disabled={running || parentBusy || !value.trim()} onClick={apply} />
        </div>
      </div>
    </div>
  );
}

/* ---- Bulk Import Dialog ---- */

function BulkImportDialog({ templates, meta, onClose, onImport }) {
  const templateNames = useMemo(() => Object.keys(templates || {}), [templates]);
  const [tplName, setTplName] = useState(templateNames[0] || "");
  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState("newline");
  const delimMap = { newline: "\n", comma: ",", semicolon: ";", tab: "\t", pipe: "|" };
  const doImport = () => {
    const tpl = templates[tplName] || {};
    const delim = delimMap[delimiter] || "\n";
    const lines = text.split(delim).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const tickets = [];
    for (let i = 0; i < lines.length; i++) {
      let summary = lines[i];
      const overrides = {};
      const hashRe = /#(\w+)\s+(.+)/g;
      let m;
      while ((m = hashRe.exec(summary)) !== null) {
        const fName = m[1].replace(/_/g, " ");
        overrides[fName] = m[2].trim();
      }
      summary = summary.replace(/#\w+\s+[^\n#]*/g, "").trim();
      const key = "LOCAL-" + Date.now() + "-" + i;
      const row = { ...tpl, "Issue key": key, "Issue id": key, Summary: summary || tpl.Summary || "New issue", ...overrides };
      tickets.push(row);
    }
    onImport(tickets);
    onClose();
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", borderRadius: 10, border: "1px solid " + T.border, background: T.card, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
        <h3 style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 600, color: T.text, margin: "0 0 8px" }}>Bulk Import</h3>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Paste one issue per line. Each line becomes the Summary. Use #Field_Name value for overrides.</p>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={labelSt}>Template</span>
          <select style={{ ...selectStyle, marginTop: 4 }} value={tplName} onChange={(e) => setTplName(e.target.value)}>
            {templateNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={labelSt}>Delimiter</span>
          <select style={{ ...selectStyle, marginTop: 4 }} value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
            {Object.keys(delimMap).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={labelSt}>Issues (paste text)</span>
          <textarea style={{ ...textareaStyle, marginTop: 4, minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"First issue summary\nSecond issue #Issue_Type Bug\nThird issue #Priority High"} />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <ActionButton label="Cancel" onClick={onClose} />
          <ActionButton label="Import" accent disabled={!text.trim()} onClick={doImport} />
        </div>
      </div>
    </div>
  );
}

/* ---- Reminder / Stale helpers ---- */

function checkStale(ticket, staleDays) {
  if (!staleDays || staleDays <= 0) return false;
  const updated = ticket.Updated || ticket.Created;
  if (!updated) return false;
  const d = new Date(updated);
  if (isNaN(d.getTime())) return false;
  const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= staleDays;
}

function getReminderDue(ticket, meta) {
  const ip = String(ticket["Internal Priority"] || "None").trim();
  const cfg = (meta.reminder_config || {})[ip];
  if (!cfg || cfg.type === "never") return false;
  const key = ticket["Issue key"] || ticket["Issue id"];
  const last = (meta.last_reminder || {})[key];
  const today = new Date().toISOString().slice(0, 10);
  if (cfg.type === "daily") return last !== today;
  if (cfg.type === "weekly") {
    if (!last) return true;
    const diff = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 7;
  }
  if (cfg.type === "on_open") return true;
  return false;
}

/* ---- JQL Builder ---- */

function buildJql(params) {
  const clauses = [];
  if (params.scope === "assigned") clauses.push("assignee = currentUser()");
  else if (params.scope === "created") clauses.push("reporter = currentUser()");
  else if (params.scope === "both") clauses.push("(assignee = currentUser() OR reporter = currentUser())");
  const pk = (params.projectKey || "").trim() || "SUNDANCE";
  clauses.push('project = "' + pk + '"');
  function inClause(field, items, mode) {
    const vals = (items || []).filter(Boolean);
    if (vals.length === 0) return null;
    const q = (x) => '"' + x + '"';
    if (mode === "all") return vals.map((x) => field + " = " + q(x)).join(" AND ");
    return field + " in (" + vals.map(q).join(", ") + ")";
  }
  const add = (c) => { if (c) clauses.push(c); };
  add(inClause("labels", params.labelFilter, params.labelMode || "any"));
  add(inClause("component", params.componentFilter, params.componentMode || "any"));
  add(inClause("issuetype", params.typeFilter, "any"));
  add(inClause("status", params.statusFilter, "any"));
  add(inClause("priority", params.priorityFilter, "any"));
  let jql = clauses.length ? clauses.join(" AND ") : "ORDER BY created DESC";
  if (!jql.toUpperCase().includes("ORDER BY")) jql += " ORDER BY created DESC";
  return jql;
}

/* ---- Utilities ---- */

function getApi() { return typeof window !== "undefined" ? window.electronAPI || window.appAPI : null; }

function readMergedConfig(extensionConfig) {
  let overlay = {};
  try { overlay = JSON.parse(localStorage.getItem(CONFIG_OVERLAY) || "{}"); } catch { overlay = {}; }
  return { ...extensionConfig, ...overlay };
}

function enrichInternalPriority(meta, ticket) {
  const k = ticket["Issue key"] || ticket["Issue id"];
  if (!k) return;
  ticket["Internal Priority"] = (meta.internal_priorities || {})[String(k)] ?? "None";
}

function openIssueInBrowser(baseUrl, key) {
  if (!baseUrl || !key || String(key).startsWith("LOCAL-")) return;
  const url = String(baseUrl).replace(/\/+$/, "") + "/browse/" + key;
  const api = getApi();
  if (api && typeof api.openExternal === "function") api.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/* ---- Welcome Section ---- */

function WelcomeSection({ listItems, meta: metaProp, onOpenKey, onOpenJira, onFetch, onRefreshAll }) {
  const meta = metaProp && typeof metaProp === "object" ? metaProp : {};
  const u = meta.welcome_updates || {};
  const newKeys = (u.new_ticket_keys || []).slice(0, 50);
  const highLevels = Array.isArray(meta.internal_priority_levels) ? meta.internal_priority_levels : ["High", "Medium", "Low", "None"];
  const firstLevel = highLevels[0] || "High";
  const opts = meta.internal_priority_options || {};
  const highSet = new Set(opts[firstLevel] && opts[firstLevel].length ? opts[firstLevel] : [firstLevel]);
  const newRows = []; const highRows = []; const blockedRows = [];
  for (const key of newKeys) {
    const item = listItems.find((it) => (it["Issue key"] || it["Issue id"]) === key);
    if (item) newRows.push({ key, label: (item["Issue key"] || "") + " -- " + (item.Summary || "").slice(0, 60) });
  }
  if (meta.welcome_show_high_priority !== false) {
    for (const it of listItems) {
      if (highSet.has(String(it["Internal Priority"] || "").trim())) {
        const key = it["Issue key"] || it["Issue id"];
        if (key) highRows.push({ key, label: key + " -- " + (it.Summary || "").slice(0, 50) });
      }
    }
  }
  for (const it of listItems) {
    const raw = it["Issue Links"] || "";
    if (!raw) continue;
    let links = [];
    try { links = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { continue; }
    if (!Array.isArray(links)) continue;
    let isBlocked = false; const blockers = [];
    for (const lnk of links) { if (String(lnk.direction_label || "").toLowerCase().includes("is blocked by")) { isBlocked = true; if (lnk.key) blockers.push(lnk.key); } }
    if (!isBlocked) continue;
    const key = it["Issue key"] || it["Issue id"];
    const st = String(it.Status || "").toLowerCase();
    if (["done", "closed", "resolved"].includes(st)) continue;
    if (key) blockedRows.push({ key, label: key + " -- " + (it.Summary || "").slice(0, 45) + " [blocked by " + blockers.slice(0, 3).join(", ") + "]" });
  }
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontFamily: T.heading, fontSize: 20, fontWeight: 600, color: T.text, margin: 0 }}>Welcome</h2>
      <div style={{ borderRadius: 8, border: "1px solid " + T.border, background: T.card, padding: 14, fontSize: 13, fontFamily: T.body, color: T.text }}>
        <p style={{ margin: 0 }}>{listItems.length} ticket(s) in your list</p>
        {(u.refreshed || u.new) ? <p style={{ margin: "4px 0 0" }}>Last sync: {u.refreshed || 0} refreshed, {u.new || 0} new</p> : null}
        {u.sync_status ? <p style={{ margin: "4px 0 0" }}>{u.sync_status}</p> : null}
        <p style={{ marginTop: 10, color: T.muted, fontSize: 12 }}>Use Fetch to download issues; Refresh updates cached rows.</p>
      </div>
      <SectionCard title="New / updated -- double-click to open">
        <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 160, overflowY: "auto" }}>
          {newRows.length === 0 && <li style={{ padding: "8px 12px", fontSize: 12, color: T.muted }}>None</li>}
          {newRows.map((r) => <TicketRow key={r.key} label={r.label} onDoubleClick={() => onOpenKey(r.key)} />)}
        </ul>
      </SectionCard>
      {meta.welcome_show_high_priority !== false && (
        <SectionCard title="High internal priority">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 140, overflowY: "auto" }}>
            {highRows.length === 0 && <li style={{ padding: "8px 12px", fontSize: 12, color: T.muted }}>None</li>}
            {highRows.map((r) => <TicketRow key={r.key} label={r.label} onDoubleClick={() => onOpenKey(r.key)} />)}
          </ul>
        </SectionCard>
      )}
      {blockedRows.length > 0 && (
        <SectionCard title="Blocked issues" accent="#c87533">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 140, overflowY: "auto" }}>
            {blockedRows.map((r) => <TicketRow key={r.key} label={r.label} onDoubleClick={() => onOpenKey(r.key)} />)}
          </ul>
        </SectionCard>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <ActionButton label="Fetch..." accent onClick={onFetch} />
        <ActionButton label="Refresh all" onClick={onRefreshAll} />
        <ActionButton label="Open in Jira" onClick={() => onOpenJira()} />
      </div>
    </div>
  );
}

/* ======== Main View ======== */

export default function AvalancheView() {
  const api = useMemo(() => getApi(), []);
  const extensionConfig = useMemo(() => {
    if (api && typeof api.getSharedContext === "function") {
      try { const ctx = api.getSharedContext(); if (ctx && ctx.extensionConfig) return ctx.extensionConfig; } catch {}
    }
    return {};
  }, [api]);
  const cfg = useMemo(() => readMergedConfig(extensionConfig), [extensionConfig]);

  const [templates, setTemplates] = useState({});
  const [meta, setMeta] = useState({});
  const [listItems, setListItems] = useState([]);
  const [viewMode, setViewMode] = useState("welcome");
  const [filterText, setFilterText] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [fetchOpen, setFetchOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [autoFetchOpen, setAutoFetchOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyDetail, setBusyDetail] = useState(null);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [maxResults, setMaxResults] = useState(50);
  const [activeFolder, setActiveFolder] = useState("All");
  /** Open issue tabs (order = tab order); full-screen ticket view uses viewMode === "issue". */
  const [issueTabKeys, setIssueTabKeys] = useState([]);
  const [bundle, setBundle] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const startupSyncDone = useRef(false);
  const reminderInterval = useRef(null);

  /* Fetch dialog params */
  const [fetchProjectKey, setFetchProjectKey] = useState(cfg.defaultProjectKey || "SUNDANCE");
  const [fetchScope, setFetchScope] = useState("both");
  const [fetchLabelFilter, setFetchLabelFilter] = useState([]);
  const [fetchLabelMode, setFetchLabelMode] = useState("any");
  const [fetchCompFilter, setFetchCompFilter] = useState([]);
  const [fetchCompMode, setFetchCompMode] = useState("any");
  const [fetchTypeFilter, setFetchTypeFilter] = useState([]);
  const [fetchStatusFilter, setFetchStatusFilter] = useState([]);
  const [fetchPriorityFilter, setFetchPriorityFilter] = useState([]);
  const [fetchFolder, setFetchFolder] = useState("");
  /** 0 = no cap (paginate JQL until all matching issues are retrieved). */
  const [fetchMax, setFetchMax] = useState(0);
  /** Lines shown inside the Fetch modal while (and briefly after) a run is active. */
  const [fetchLogLines, setFetchLogLines] = useState([]);

  const client = useMemo(
    () => createJiraClient(api, { baseUrl: cfg.jiraBaseUrl, email: cfg.jiraEmail, token: cfg.jiraApiToken }),
    [api, cfg.jiraBaseUrl, cfg.jiraEmail, cfg.jiraApiToken],
  );

  useEffect(() => {
    debugLog("view", "mount", { hasAPI: !!api });
    function onErr(ev) { logWindowError("error", ev); }
    function onRej(ev) { logWindowError("unhandledrejection", ev); }
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, [api]);

  useEffect(() => {
    const { templates: t, meta: m } = loadBlob();
    setTemplates(t); setMeta(m);
    const items = dedupListItems(m.fetched_issues || []);
    items.forEach((it) => enrichInternalPriority(m, it));
    setListItems(items);
    setBundle(Array.isArray(m.bundle) ? m.bundle : []);
  }, []);

  const persist = useCallback((nextT, nextM, nextList) => {
    setTemplates(nextT); setMeta(nextM); setListItems(nextList);
    nextM.fetched_issues = [...nextList];
    saveBlob(nextT, nextM);
  }, []);

  const templatesRef = useRef(templates);
  const metaRef = useRef(meta);
  const listItemsRef = useRef(listItems);
  templatesRef.current = templates;
  metaRef.current = meta;
  listItemsRef.current = listItems;

  const syncJiraFieldCatalog = useCallback(async () => {
    if (!client) {
      setError("Configure Jira credentials first.");
      return;
    }
    const pk = cfg.defaultProjectKey || "SUNDANCE";
    setBusyDetail("Loading Jira field definitions…");
    setError(null);
    try {
      const catalog = await buildJiraFieldCatalog(client, pk);
      setBusyDetail("Loading Jira field options…");
      const optionCatalog = await buildJiraOptionCatalog(
        client,
        pk,
        metaRef.current.options || {},
        catalog,
      );
      const nextMeta = {
        ...metaRef.current,
        jira_field_catalog: catalog,
        jira_option_catalog: optionCatalog,
        options: optionCatalog.options,
      };
      persist(templatesRef.current, nextMeta, listItemsRef.current);
      const n = catalog.projectFieldIds.length;
      const msg =
        "Field definitions synced: " +
        catalog.allFieldsCount +
        " site-wide, " +
        n +
        " on project " +
        pk +
        " (search +" + (catalog.sourceCounts?.fieldSearch || 0) +
        ", createmeta +" + (catalog.sourceCounts?.createMeta || 0) +
        ", editmeta +" + (catalog.sourceCounts?.editMeta || 0) + ").";
      const sc = optionCatalog.sourceCounts || {};
      const optSummary =
        " Options synced — priority:" + ((optionCatalog.options && optionCatalog.options.Priority || []).length) +
        " resolution:" + ((optionCatalog.options && optionCatalog.options.Resolution || []).length) +
        " status:" + ((optionCatalog.options && optionCatalog.options.Status || []).length) +
        " issueType:" + ((optionCatalog.options && optionCatalog.options["Issue Type"] || []).length) +
        " sprints:" + ((optionCatalog.options && optionCatalog.options.Sprint || []).length) +
        " components:" + ((optionCatalog.options && optionCatalog.options.Components || []).length) +
        " fixVersions:" + ((optionCatalog.options && optionCatalog.options["Fix Version"] || []).length) +
        " labels:" + ((optionCatalog.options && optionCatalog.options.Labels || []).length) +
        " (new: createMeta+" + (sc.createMeta || 0) +
        " editMeta+" + (sc.editMeta || 0) +
        " priorities+" + (sc.priorities || 0) +
        " resolutions+" + (sc.resolutions || 0) +
        " statuses+" + (sc.statuses || 0) +
        " sprints+" + (sc.sprints || 0) +
        " issueTypes+" + (sc.issueTypes || 0) + ").";
      const warn = [
        catalog.fieldSearchError,
        catalog.createMetaError,
        catalog.editMetaError,
        ...(optionCatalog.warnings || []),
      ]
        .filter(Boolean)
        .join(" | ");
      setStatusMsg(warn ? msg + optSummary + " Warnings: " + warn : msg + optSummary);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusyDetail(null);
    }
  }, [client, cfg.defaultProjectKey, persist]);

  useEffect(() => {
    if (!client || !cfg.jiraBaseUrl || !cfg.jiraEmail) return;
    const pk = cfg.defaultProjectKey || "SUNDANCE";
    let cancelled = false;
    const t = setTimeout(() => {
      const cat = metaRef.current.jira_field_catalog;
      // Skip only if the catalog is current version, same project, and synced within the last 5 minutes
      // (prevents redundant back-to-back syncs within a single session while still syncing on every load).
      const fresh =
        cat &&
        cat.version === 6 &&
        cat.projectKey === pk &&
        cat.syncedAt &&
        Date.now() - new Date(cat.syncedAt).getTime() < 5 * 60 * 1000;
      if (fresh) return;
      (async () => {
        try {
          setBusyDetail("Loading Jira field definitions…");
          const catalog = await buildJiraFieldCatalog(client, pk);
          if (cancelled) return;
          setBusyDetail("Loading Jira field options…");
          const optionCatalog = await buildJiraOptionCatalog(
            client,
            pk,
            metaRef.current.options || {},
            catalog,
          );
          if (cancelled) return;
          persist(
            templatesRef.current,
            {
              ...metaRef.current,
              jira_field_catalog: catalog,
              jira_option_catalog: optionCatalog,
              options: optionCatalog.options,
            },
            listItemsRef.current,
          );
        } catch (e) {
          debugError("view", "field catalog auto-sync failed", e);
        } finally {
          if (!cancelled) setBusyDetail(null);
        }
      })();
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [client, cfg.jiraBaseUrl, cfg.jiraEmail, cfg.defaultProjectKey, persist]);

  const selectedTicket = useMemo(() => {
    if (!selectedKey) return null;
    return listItems.find((it) => (it["Issue key"] || it["Issue id"]) === selectedKey);
  }, [listItems, selectedKey]);

  useEffect(() => {
    if (!selectedTicket) { setDraft(null); return; }
    const d = JSON.parse(JSON.stringify(selectedTicket));
    enrichInternalPriority(meta, d);
    setDraft(d);
  }, [selectedTicket, meta]);

  /* Folder-aware filtering */
  const folders = useMemo(() => meta.folders || [], [meta.folders]);
  const ticketFolders = useMemo(() => meta.ticket_folders || {}, [meta.ticket_folders]);

  const filteredItems = useMemo(() => {
    let items = listItems;
    if (activeFolder !== "All") {
      if (activeFolder === "Unfiled") {
        items = items.filter((it) => { const k = it["Issue key"] || it["Issue id"]; return !ticketFolders[k]; });
      } else {
        items = items.filter((it) => { const k = it["Issue key"] || it["Issue id"]; return ticketFolders[k] === activeFolder; });
      }
    }
    const q = filterText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const blob = [it["Issue key"], it.Summary, it.Status, it.Assignee, it.Labels, it["Issue Type"], it.Priority].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [listItems, filterText, activeFolder, ticketFolders]);

  const kanbanColumns = useMemo(() => {
    const kc = meta.kanban_columns;
    if (Array.isArray(kc) && kc.length) { const cleaned = kc.filter((c) => c && typeof c === "object" && Array.isArray(c.statuses)); if (cleaned.length) return cleaned; }
    return DEFAULT_KANBAN_COLUMNS;
  }, [meta.kanban_columns]);

  function columnForTicket(it) {
    const status = (it.Status || "").trim().toLowerCase();
    for (const col of kanbanColumns) { for (const s of col.statuses || []) { if (status === String(s).trim().toLowerCase()) return col.name; } }
    return kanbanColumns[0]?.name || "Backlog";
  }

  /* Stale check */
  const staleDays = meta.stale_ticket_enabled ? (meta.stale_ticket_days || 14) : 0;

  /* Reminders tick */
  useEffect(() => {
    function checkReminders() {
      const doneStatuses = new Set(["done", "closed", "resolved", "complete", "completed", "cancelled"]);
      const notes = [];
      for (const it of listItems) {
        const st = String(it.Status || "").toLowerCase();
        if (doneStatuses.has(st)) continue;
        const key = it["Issue key"] || it["Issue id"];
        if (!key || String(key).startsWith("LOCAL-")) continue;
        if (getReminderDue(it, meta)) notes.push({ key, type: "reminder", msg: key + ": reminder due (" + (it["Internal Priority"] || "None") + ")" });
        if (staleDays && checkStale(it, staleDays)) notes.push({ key, type: "stale", msg: key + ": stale (no update in " + staleDays + " days)" });
      }
      setNotifications(notes);
    }
    checkReminders();
    reminderInterval.current = setInterval(checkReminders, 60000);
    return () => clearInterval(reminderInterval.current);
  }, [listItems, meta, staleDays]);

  const testConnection = async () => {
    if (!client) { setError("Set Jira credentials."); return; }
    setBusy(true); setError(null);
    try { const me = await client.myself(); setStatusMsg("OK -- " + (me.displayName || me.emailAddress || "connected")); }
    catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  };

  /* Structured Fetch */
  const runStructuredFetch = async (params, folderName) => {
    if (!client) { setError("Configure Jira credentials."); return; }
    const jql = buildJql(params);
    debugLog("fetch", "JQL built", { jql });
    setBusy(true); setError(null);
    setFetchLogLines(["Building query…", "JQL: " + (jql.length > 280 ? jql.slice(0, 280) + "…" : jql)]);
    try {
      const maxCap =
        params.maxResults === 0 || params.maxResults === undefined || params.maxResults === null
          ? 0
          : Number(params.maxResults);
      setFetchLogLines((prev) => [...prev, maxCap === 0 ? "Searching Jira (all pages, 100 issues/page)…" : "Searching Jira (max " + maxCap + " issues)…"]);
      const searchResult = await client.searchJqlAll(jql, {
        maxTotal: maxCap === 0 ? 0 : maxCap,
        onProgress: (p) => {
          setBusyDetail("JQL search: " + p.total + " issue(s) found (page " + p.page + ")…");
          setFetchLogLines((prev) => [
            ...prev.slice(-450),
            "Page " + p.page + ": +" + p.batchSize + " → " + p.total + " total" + (p.truncated ? " (reached cap)" : ""),
          ]);
        },
      });
      const issues = searchResult.issues || [];
      if (searchResult.truncated) {
        setFetchLogLines((prev) => [...prev, "Stopped at max-results cap (" + issues.length + " issues)."]);
      }
      setFetchLogLines((prev) => [...prev, "Found " + issues.length + " issue(s). Loading full field data per issue…"]);
      setBusyDetail(issues.length ? "Loading " + issues.length + " issue(s)…" : "No issues returned.");
      const keysBefore = new Set(listItems.map((it) => String(it["Issue key"] || "").trim()).filter(Boolean));
      const newTicketKeys = [];
      const next = [...listItems];
      const mergedOpts = { ...(meta.options || {}) };
      const nextFolders = [...(meta.folders || [])];
      const nextTicketFolders = { ...(meta.ticket_folders || {}) };
      if (folderName && !nextFolders.includes(folderName)) nextFolders.push(folderName);
      for (let fi = 0; fi < issues.length; fi++) {
        const entry = issues[fi];
        const id = entry.id || entry.key;
        if (!id) continue;
        const label = entry.key || String(id);
        const line = "[" + (fi + 1) + "/" + issues.length + "] " + label;
        setBusyDetail(line);
        setFetchLogLines((prev) => [...prev.slice(-500), line]);
        const issueJson = await client.fetchIssue(entry.key || id);
        if (!issueJson || !issueJson.fields) continue;
        const row = client.mapToRow(issueJson);
        enrichInternalPriority(meta, row);
        const k = row["Issue key"] || row["Issue id"];
        client.harvest(row, mergedOpts);
        const idx = next.findIndex((it) => (it["Issue key"] || it["Issue id"]) === k);
        if (idx >= 0) next[idx] = row;
        else { next.push(row); if (k && !keysBefore.has(String(k))) { newTicketKeys.push(k); keysBefore.add(String(k)); } }
        if (folderName && k) nextTicketFolders[k] = folderName;
      }
      const deduped = dedupListItems(next);
      const nextMeta = { ...meta, options: mergedOpts, folders: nextFolders, ticket_folders: nextTicketFolders,
        welcome_updates: { ...meta.welcome_updates, new: newTicketKeys.length, new_ticket_keys: newTicketKeys, sync_status: "Fetched " + issues.length + " issue(s)." }, first_run_done: true };
      persist(templates, nextMeta, deduped);
      interopPublish(api, "fetch", "complete", { count: issues.length });
      setFetchLogLines((prev) => [...prev, "Done. Saved " + issues.length + " issue(s)."]);
      setFetchOpen(false); setViewMode("list");
      setStatusMsg("Fetched " + issues.length + " issue(s).");
      if (folderName) setActiveFolder(folderName);
    } catch (e) {
      debugError("view", "fetch failed", e);
      setError(e.message || String(e));
      setFetchLogLines((prev) => [...prev, "Error: " + (e.message || String(e))]);
    } finally { setBusy(false); setBusyDetail(null); }
  };

  /* Auto-fetch on mount */
  useEffect(() => {
    if (!client || startupSyncDone.current) return;
    const afc = meta.auto_fetch_config;
    if (!afc || !afc.enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    if (afc.last_run_date === today) return;
    startupSyncDone.current = true;
    const t = setTimeout(() => {
      runStructuredFetch({
        scope: afc.scope || "assigned", projectKey: afc.project_key || "SUNDANCE",
        labelFilter: afc.label_filter || [], labelMode: afc.label_mode || "any",
        componentFilter: afc.component_filter || [], componentMode: afc.component_mode || "any",
        typeFilter: afc.type_filter || [], statusFilter: afc.status_filter || [],
        priorityFilter: afc.priority_filter || [], maxResults: afc.max_results != null ? afc.max_results : 0,
      }, afc.folder_name || "").then(() => {
        const nextMeta = { ...meta, auto_fetch_config: { ...afc, last_run_date: today } };
        persist(templates, nextMeta, listItems);
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [client, meta.auto_fetch_config]);

  const refreshAll = useCallback(async () => {
    if (!client) { setError("Configure Jira credentials."); return; }
    setBusy(true); setError(null);
    const updates = { refreshed: 0, failed: 0 };
    try {
      const doneStatuses = new Set(["done", "closed", "resolved", "complete", "completed", "cancelled"]);
      const toRefresh = [];
      listItems.forEach((it, idx) => {
        const status = String(it.Status || "").trim().toLowerCase();
        if (doneStatuses.has(status)) return;
        const key = it["Issue key"] || it["Issue id"];
        if (key && !String(key).startsWith("LOCAL-")) toRefresh.push({ idx, key });
      });
      const next = [...listItems];
      const mergedOpts = { ...(meta.options || {}) };
      let c404 = 0;
      const nRefresh = toRefresh.length;
      for (let ri = 0; ri < toRefresh.length; ri++) {
        const { idx, key } = toRefresh[ri];
        if (c404 >= 3) break;
        setBusyDetail("Refreshing " + (ri + 1) + "/" + nRefresh + ": " + key);
        try {
          const issueJson = await client.fetchIssue(key);
          if (!issueJson || !issueJson.fields) { updates.failed++; continue; }
          c404 = 0;
          const row = client.mapToRow(issueJson, next[idx]);
          enrichInternalPriority(meta, row); client.harvest(row, mergedOpts);
          next[idx] = row; updates.refreshed++;
        } catch (e) { updates.failed++; if (String(e).includes("404")) c404++; }
      }
      const deduped = dedupListItems(next);
      persist(templates, { ...meta, options: mergedOpts, welcome_updates: { ...updates, sync_status: "Refresh complete." } }, deduped);
      setStatusMsg(updates.refreshed + " refreshed, " + updates.failed + " failed");
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); setBusyDetail(null); }
  }, [client, listItems, meta, templates, persist]);

  const refreshSingleIssue = useCallback(async (key) => {
    if (!client || !key || String(key).startsWith("LOCAL-")) return;
    try {
      const issueJson = await client.fetchIssue(key);
      if (!issueJson || !issueJson.fields) return;
      const row = client.mapToRow(issueJson);
      enrichInternalPriority(meta, row);
      const mergedOpts = { ...(meta.options || {}) };
      client.harvest(row, mergedOpts);
      const next = listItems.map((it) => (it["Issue key"] || it["Issue id"]) === key ? row : it);
      persist(templates, { ...meta, options: mergedOpts }, dedupListItems(next));
    } catch (e) { debugError("view", "refreshSingleIssue failed", e); }
  }, [client, listItems, meta, templates, persist]);

  const saveLocalDraft = () => {
    if (!draft) return;
    const k = draft["Issue key"] || draft["Issue id"];
    if (!k) return;
    const next = listItems.map((it) => (it["Issue key"] || it["Issue id"]) === k ? { ...draft } : it);
    persist(templates, { ...meta, internal_priorities: { ...(meta.internal_priorities || {}), [String(k)]: draft["Internal Priority"] || "None" } }, next);
    setStatusMsg("Saved locally.");
  };

  /**
   * Push an update payload to Jira with a 4-tier fallback so that a single
   * restricted/malformed field never silently blocks every other field from saving.
   *
   * Tier 1 — full payload
   * Tier 2 — strip sprint, epic/parent, time estimates, environment, components, fixVersions
   * Tier 3 — also strip description (sanitized ADF can still fail on some project configs)
   * Tier 4 — minimum: summary + labels + priority only
   *
   * Returns a human-readable note about which tier succeeded (empty string = tier 1).
   */
  const pushUpdateWithRetry = async (issueKey, fields) => {
    debugLog("view", "pushUpdateWithRetry fields", { key: issueKey, fieldKeys: Object.keys(fields) });

    const is400 = (e) => {
      const m = String(e.message || "");
      return m.includes("400") || m.includes("INVALID_INPUT");
    };

    // Tier 1
    try {
      await client.updateIssue(issueKey, fields);
      return "";
    } catch (e1) {
      if (!is400(e1)) throw e1;
      debugWarn("view", issueKey + " tier-1 rejected → tier-2 (dropping sprint/epic/time/env/components/versions)", String(e1.message));
    }

    // Tier 2 — strip project-scheme-specific fields
    const {
      timeoriginalestimate, timeestimate,
      customfield_10020, customfield_10014, parent,
      environment, components, fixVersions,
      ...t2
    } = fields;
    try {
      await client.updateIssue(issueKey, t2);
      return "(sprint/components/versions skipped — permission or name mismatch)";
    } catch (e2) {
      if (!is400(e2)) throw e2;
      debugWarn("view", issueKey + " tier-2 rejected → tier-3 (also dropping description)", String(e2.message));
    }

    // Tier 3 — also drop description
    const { description: _d, ...t3 } = t2;
    try {
      await client.updateIssue(issueKey, t3);
      return "(description skipped — ADF not accepted by this project; edit it directly in Jira)";
    } catch (e3) {
      if (!is400(e3)) throw e3;
      debugWarn("view", issueKey + " tier-3 rejected → tier-4 (summary/labels/priority only)", String(e3.message));
    }

    // Tier 4 — unconditionally safe minimum
    const t4 = {};
    if (fields.summary != null) t4.summary = fields.summary;
    if (fields.labels  != null) t4.labels  = fields.labels;
    if (fields.priority != null) t4.priority = fields.priority;
    await client.updateIssue(issueKey, t4);
    return "(only summary/labels/priority saved — check Jira project field permissions)";
  };

  const saveToJira = async () => {
    if (!client || !draft) { setError("Nothing to save."); return; }
    const key = draft["Issue key"] || "";
    if (!key || String(key).startsWith("LOCAL-")) { setError("Use Create in Jira for new issues."); return; }

    // Safety cross-reference: confirm this key belongs to a ticket that was actually fetched from
    // Jira (_jira_fetched flag), not a local draft or template that happened to carry a real key.
    const isFetchedFromJira = draft._jira_fetched === true ||
      listItems.some((it) => (it["Issue key"] || it["Issue id"]) === key && it._jira_fetched === true);
    if (!isFetchedFromJira) {
      const ok = window.confirm(
        "Safety check\n\n" +
        "\"" + key + "\" was not loaded from Jira in this session — it may be a local draft or template.\n\n" +
        "Continuing will UPDATE " + key + " on the Jira server.\n" +
        "If you meant to create a new ticket, click Cancel and use the \"New Issue\" button instead.\n\n" +
        "Update " + key + " in Jira?"
      );
      if (!ok) return;
    }

    setBusy(true); setError(null);
    try {
      const resolved = applyVariables(draft);
      const fields = buildUpdateFieldsFromTicket(resolved);
      const note = await pushUpdateWithRetry(key, fields);
      await refreshSingleIssue(key);
      setStatusMsg("Updated " + key + " in Jira." + (note ? " " + note : ""));
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  };

  const createInJira = async () => {
    if (!client || !draft) { setError("Nothing to create."); return; }
    setBusy(true); setError(null);
    try {
      const resolved = applyVariables(draft);
      const fields = buildCreateFieldsFromTicket(resolved, cfg.defaultProjectKey);
      const result = await client.createIssue(fields);
      const newKey = result.key || result.id;
      if (!newKey) throw new Error("Jira did not return a key.");
      const issueJson = await client.fetchIssue(newKey);
      const row = client.mapToRow(issueJson);
      enrichInternalPriority(meta, row);
      const mergedOpts = { ...(meta.options || {}) };
      client.harvest(row, mergedOpts);
      const localKey = draft["Issue key"] || draft["Issue id"];
      const next = listItems.map((it) => (it["Issue key"] || it["Issue id"]) === localKey ? row : it);
      persist(templates, { ...meta, options: mergedOpts }, dedupListItems(next));
      setSelectedKey(newKey);
      setIssueTabKeys((prev) => {
        const without = prev.filter((x) => x !== localKey);
        return without.includes(newKey) ? without : [...without, newKey];
      });
      setViewMode("issue");
      setStatusMsg("Created " + newKey + " in Jira.");
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  };

  const doTransition = async (transitionId) => {
    if (!client || !draft) return;
    const key = draft["Issue key"] || "";
    if (!key || String(key).startsWith("LOCAL-")) return;
    setBusy(true); setError(null);
    try { await client.doTransition(key, transitionId); await refreshSingleIssue(key); setStatusMsg("Transitioned " + key + "."); }
    catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  };

  const createNewLocalTicket = (template) => {
    const key = "LOCAL-" + Date.now();
    // Strip any Jira-identity fields the template might carry, then mark the row as a local draft
    // so it can never be routed through saveToJira by accident.
    const { "Issue key": _k, "Issue id": _i, _jira_fetched: _jf, ...tplClean } = (template || {});
    const row = { "Issue key": key, "Issue id": key, Summary: "", "Issue Type": "Task", Status: "To Do", Priority: "Medium", Assignee: "", Labels: "", Components: "", Description: "", ...tplClean, _jira_fetched: false };
    persist(templates, meta, [row, ...listItems]);
    setSelectedKey(key);
    setIssueTabKeys((prev) => (prev.includes(key) ? prev : [...prev, key].slice(-25)));
    setViewMode("issue");
  };

  const closeIssueTab = (k, ev) => {
    if (ev) ev.stopPropagation();
    setIssueTabKeys((prev) => {
      const next = prev.filter((x) => x !== k);
      if (selectedKey === k) {
        if (next.length) {
          setSelectedKey(next[next.length - 1]);
          setViewMode("issue");
        } else {
          setSelectedKey(null);
          setViewMode("list");
        }
      }
      return next;
    });
  };

  /* Bundle operations */
  const addToBundle = (ticket) => {
    const k = ticket["Issue key"] || ticket["Issue id"];
    if (bundle.find((b) => (b["Issue key"] || b["Issue id"]) === k)) return;
    const nb = [...bundle, { ...ticket }];
    setBundle(nb);
    persist(templates, { ...meta, bundle: nb }, listItems);
    setStatusMsg("Added " + k + " to bundle.");
  };

  const removeFromBundle = (idx) => {
    const nb = bundle.filter((_, i) => i !== idx);
    setBundle(nb);
    persist(templates, { ...meta, bundle: nb }, listItems);
  };

  const uploadBundle = async () => {
    if (!client || bundle.length === 0) return;
    setBusy(true); setError(null);
    const results = [];
    const remaining = [...bundle];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const ticket = remaining[i];
      const k = ticket["Issue key"] || ticket["Issue id"];
      try {
        const resolved = applyVariables(ticket);
        if (String(k).startsWith("LOCAL-")) {
          const fields = buildCreateFieldsFromTicket(resolved, cfg.defaultProjectKey);
          const result = await client.createIssue(fields);
          results.push({ key: k, ok: true, msg: "Created " + (result.key || result.id) });
        } else {
          const fields = buildUpdateFieldsFromTicket(resolved);
          const note = await pushUpdateWithRetry(k, fields);
          results.push({ key: k, ok: true, msg: "Updated" + (note ? " " + note : "") });
        }
        remaining.splice(i, 1);
      } catch (e) { results.push({ key: k, ok: false, msg: String(e.message || e) }); }
    }
    setBundle(remaining);
    persist(templates, { ...meta, bundle: remaining }, listItems);
    const ok = results.filter((r) => r.ok).length;
    setStatusMsg("Bundle: " + ok + "/" + results.length + " succeeded.");
    setBusy(false);
    if (ok > 0) refreshAll();
  };

  /* Template CRUD */
  const saveTemplate = (name) => {
    if (!name) return;
    const data = draft ? { ...draft } : {};
    delete data["Issue key"]; delete data["Issue id"];
    delete data._assignee_accountId; delete data._reporter_accountId;
    delete data._sprint_id; delete data._component_ids; delete data._fixversion_ids; delete data._epic_mode;
    delete data._jira_fetched; // templates are never tied to a Jira ticket
    persist({ ...templates, [name]: data }, meta, listItems);
    setStatusMsg('Template "' + name + '" saved.');
  };
  const deleteTemplate = (name) => { const nextT = { ...templates }; delete nextT[name]; persist(nextT, meta, listItems); };
  const duplicateTemplate = (name) => { if (templates[name]) persist({ ...templates, [name + " (copy)"]: { ...templates[name] } }, meta, listItems); };

  /* Folder management */
  const createFolder = (name) => {
    if (!name || folders.includes(name)) return;
    persist(templates, { ...meta, folders: [...folders, name] }, listItems);
  };
  const moveToFolder = (keys, folderName) => {
    const tf = { ...ticketFolders };
    for (const k of keys) { if (folderName) tf[k] = folderName; else delete tf[k]; }
    persist(templates, { ...meta, ticket_folders: tf }, listItems);
  };

  const removeTickets = (keys) => {
    const removeSet = new Set(keys);
    const next = listItems.filter((it) => !removeSet.has(it["Issue key"] || it["Issue id"]));
    const tf = { ...ticketFolders };
    const ip = { ...(meta.internal_priorities || {}) };
    const nb = bundle.filter((b) => !removeSet.has(b["Issue key"] || b["Issue id"]));
    for (const k of keys) { delete tf[k]; delete ip[k]; }
    setBundle(nb);
    if (selectedKey && removeSet.has(selectedKey)) { setSelectedKey(null); setDraft(null); setViewMode("list"); }
    setIssueTabKeys((prev) => prev.filter((x) => !removeSet.has(x)));
    setSelectedKeys((prev) => { const s = new Set(prev); for (const k of keys) s.delete(k); return s; });
    persist(templates, { ...meta, ticket_folders: tf, internal_priorities: ip, bundle: nb }, next);
    setStatusMsg("Removed " + keys.length + " ticket(s).");
  };

  const onSelectRow = (key) => {
    setSelectedKey(key);
    setIssueTabKeys((prev) => (prev.includes(key) ? prev : [...prev, key].slice(-25)));
    setViewMode("issue");
  };
  const toggleSelectKey = (key) => { setSelectedKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
  const toggleSelectAll = () => { if (selectedKeys.size === filteredItems.length) setSelectedKeys(new Set()); else setSelectedKeys(new Set(filteredItems.map((it) => it["Issue key"] || it["Issue id"]))); };

  const tabStyle = (active) => ({
    padding: "4px 10px", fontSize: 12, fontWeight: 600, fontFamily: T.body,
    textTransform: "none", borderRadius: 4, border: "none", cursor: "pointer",
    background: active ? "rgba(211,166,37,0.2)" : "transparent",
    color: active ? T.accent : T.muted,
    borderBottom: active ? "2px solid " + T.accent : "2px solid transparent",
    whiteSpace: "nowrap",
  });
  const issueTabStyle = (active) => ({
    ...tabStyle(active),
    display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 160,
    fontFamily: T.mono, fontSize: 11,
  });

  const [transitions, setTransitions] = useState([]);
  useEffect(() => {
    if (!client || !draft) { setTransitions([]); return; }
    const key = draft["Issue key"] || "";
    if (!key || String(key).startsWith("LOCAL-")) { setTransitions([]); return; }
    let cancelled = false;
    client.getTransitions(key).then((t) => { if (!cancelled) setTransitions(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [client, draft && (draft["Issue key"] || draft["Issue id"])]);

  const isLocal = draft && String(draft["Issue key"] || "").startsWith("LOCAL-");

  function renderTicketPanel() {
    if (!draft) {
      return <p style={{ fontSize: 13, color: T.muted }}>Select a ticket from the list or open a tab above.</p>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: T.heading, fontSize: 14, fontWeight: 600, color: T.accent, borderBottom: "1px solid " + T.border, paddingBottom: 8 }}>
          {draft["Issue key"] || draft["Issue id"]}
          {draft["Project key"] ? <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>{draft["Project key"]}</span> : null}
          {staleDays && checkStale(draft, staleDays) && <span style={{ fontSize: 10, color: "#E0A040", marginLeft: 8 }}>(stale)</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {!isLocal && <ActionButton label="Open in Jira" onClick={() => openIssueInBrowser(cfg.jiraBaseUrl, draft["Issue key"] || draft["Issue id"])} />}
          <ActionButton label="Save local" onClick={saveLocalDraft} />
          {isLocal ? <ActionButton label="Create in Jira" accent disabled={busy} onClick={createInJira} /> : <ActionButton label="Push to Jira" accent disabled={busy} onClick={saveToJira} />}
          {!isLocal && <ActionButton label="Refresh" small disabled={busy} onClick={() => refreshSingleIssue(draft["Issue key"])} />}
          <ActionButton label="Add to bundle" small onClick={() => addToBundle(draft)} />
          <ActionButton label="Remove" small danger onClick={() => { if (confirm("Remove " + (draft["Issue key"] || draft["Issue id"]) + " from your list?")) removeTickets([draft["Issue key"] || draft["Issue id"]]); }} />
        </div>
        <label style={{ display: "block" }}><span style={labelSt}>Summary</span><input style={{ ...inputStyle, marginTop: 4 }} value={draft.Summary || ""} onChange={(e) => setDraft({ ...draft, Summary: e.target.value })} /></label>
        <div><span style={labelSt}>Status</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{draft.Status || "--"}</span>
            {transitions.length > 0 && <select style={{ ...selectStyle, width: "auto", fontSize: 11, padding: "2px 6px" }} value="" onChange={(e) => { if (e.target.value) doTransition(e.target.value); }}>
              <option value="">Move to...</option>
              {transitions.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
            </select>}
          </div>
        </div>
        <label style={{ display: "block" }}><span style={labelSt}>Resolution</span>
          <ComboBox value={draft.Resolution} style={{ marginTop: 4 }} options={(meta.options && meta.options.Resolution) || ["Done", "Fixed", "Won't Fix", "Duplicate", "Incomplete", "Cannot Reproduce"]} onChange={(v) => setDraft({ ...draft, Resolution: v })} />
        </label>
        <label style={{ display: "block" }}><span style={labelSt}>Issue Type</span>
          <ComboBox value={draft["Issue Type"]} onChange={(v) => setDraft({ ...draft, "Issue Type": v })} options={(meta.options && meta.options["Issue Type"]) || ["Task", "Bug", "Story", "Epic"]} style={{ marginTop: 4 }} />
        </label>
        <label style={{ display: "block" }}><span style={labelSt}>Assignee</span><ComboBox value={draft.Assignee} style={{ marginTop: 4 }} options={(meta.options && meta.options.Assignee) || []} onChange={(v) => setDraft({ ...draft, Assignee: v })} /></label>
        <div><span style={labelSt}>Reporter</span><div style={{ fontSize: 13, marginTop: 4 }}>{draft.Reporter || "--"}</div></div>
        <label style={{ display: "block" }}><span style={labelSt}>Priority</span><ComboBox value={draft.Priority} style={{ marginTop: 4 }} options={(meta.options && meta.options.Priority) || ["Highest", "High", "Medium", "Low", "Lowest"]} onChange={(v) => setDraft({ ...draft, Priority: v })} /></label>
        <label style={{ display: "block" }}><span style={labelSt}>Labels</span><div style={{ marginTop: 4 }}><MultiSelect value={draft.Labels} options={(meta.options && meta.options.Labels) || []} onChange={(v) => setDraft({ ...draft, Labels: v })} placeholder="Add labels..." /></div></label>
        <label style={{ display: "block" }}><span style={labelSt}>Component</span><ComboBox value={draft.Components} style={{ marginTop: 4 }} options={(meta.options && meta.options.Components) || []} onChange={(v) => setDraft({ ...draft, Components: v })} placeholder="Select component..." /></label>
        <label style={{ display: "block" }}><span style={labelSt}>Sprint</span><ComboBox value={draft.Sprint} style={{ marginTop: 4 }} options={(meta.options && meta.options.Sprint) || []} onChange={(v) => setDraft({ ...draft, Sprint: v })} /></label>
        <label style={{ display: "block" }}><span style={labelSt}>Fix Version</span><div style={{ marginTop: 4 }}><MultiSelect value={draft["Fix Version"]} options={(meta.options && meta.options["Fix Version"]) || []} onChange={(v) => setDraft({ ...draft, "Fix Version": v })} placeholder="Add versions..." /></div></label>
        <label style={{ display: "block" }}><span style={labelSt}>Environment</span><input style={{ ...inputStyle, marginTop: 4 }} value={draft.Environment || ""} onChange={(e) => setDraft({ ...draft, Environment: e.target.value })} /></label>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1 }}><span style={labelSt}>Orig. Est.</span><input style={{ ...inputStyle, marginTop: 4, fontSize: 11 }} placeholder="2d 4h" value={draft["Original Estimate"] || ""} onChange={(e) => setDraft({ ...draft, "Original Estimate": e.target.value })} /></label>
          <label style={{ flex: 1 }}><span style={labelSt}>Remaining</span><input style={{ ...inputStyle, marginTop: 4, fontSize: 11 }} placeholder="1d" value={draft["Remaining Estimate"] || ""} onChange={(e) => setDraft({ ...draft, "Remaining Estimate": e.target.value })} /></label>
        </div>
        <label style={{ display: "block" }}><span style={labelSt}>Epic</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Epic issue key (e.g. PROJ-123)"
              value={draft["Epic Link"] || ""}
              onChange={(e) => setDraft({ ...draft, "Epic Link": e.target.value })} />
            {draft["Epic Link"] && (
              <span style={{ fontSize: 13, color: T.accent, cursor: "pointer", flexShrink: 0, fontWeight: 700 }}
                onClick={() => onSelectRow(draft["Epic Link"])} title="Open epic">→</span>
            )}
          </div>
          {draft["Epic Name"] && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{draft["Epic Name"]}</div>}
        </label>
        <label style={{ display: "block" }}><span style={labelSt}>Parent</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Parent issue key (e.g. PROJ-456)"
              value={draft["Parent key"] || draft.Parent || ""}
              onChange={(e) => setDraft({ ...draft, "Parent key": e.target.value, Parent: e.target.value })} />
            {(draft["Parent key"] || draft.Parent) && (
              <span style={{ fontSize: 13, color: T.accent, cursor: "pointer", flexShrink: 0, fontWeight: 700 }}
                onClick={() => onSelectRow(draft["Parent key"] || draft.Parent)} title="Open parent">→</span>
            )}
          </div>
          {draft["Parent summary"] && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{draft["Parent summary"]}</div>}
        </label>
        {draft.Subtasks ? <div><span style={labelSt}>Subtasks</span><div style={{ fontSize: 11, marginTop: 4, fontFamily: T.mono, lineHeight: 1.4 }}>{draft.Subtasks}</div></div> : null}
        <label style={{ display: "block" }}><span style={labelSt}>Internal Priority (local)</span>
          <select style={{ ...selectStyle, marginTop: 4 }} value={draft["Internal Priority"] || "None"} onChange={(e) => setDraft({ ...draft, "Internal Priority": e.target.value })}>
            {(Array.isArray(meta.internal_priority_levels) ? meta.internal_priority_levels : ["High", "Medium", "Low", "None"]).map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
        </label>
        <div><span style={labelSt}>Description</span><div style={{ marginTop: 4 }}>
          <RichEditor
            adf={draft["Description ADF"] && typeof draft["Description ADF"] === "object" ? draft["Description ADF"] : null}
            renderedHtml={draft["Description Rendered"] || ""}
            onChange={(newAdf) => setDraft((prev) => prev ? { ...prev, "Description ADF": newAdf, "Description Rendered": "" } : prev)} />
        </div></div>
        {draft["Jira fields (extra)"] && (() => {
          let parsed = {};
          try { parsed = JSON.parse(draft["Jira fields (extra)"]); } catch { return null; }
          const keys = Object.keys(parsed).sort((a, b) => a.localeCompare(b));
          if (!keys.length) return null;
          const cat = meta.jira_field_catalog;
          const labelFor = (id) => {
            const fd = cat && cat.fieldById && cat.fieldById[id];
            return (fd && fd.name) || id;
          };
          return (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 600, color: T.muted }}>More Jira fields ({keys.length})</summary>
              {!cat && <p style={{ fontSize: 10, color: T.muted, margin: "6px 0 0" }}>Use header &quot;Sync fields&quot; to load names for custom fields.</p>}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", fontSize: 11 }}>
                {keys.map((k) => {
                  const lbl = labelFor(k);
                  return (
                    <div key={k} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: 6 }}>
                      <div style={{ color: T.text, fontSize: 12, fontFamily: T.body, fontWeight: 600 }}>{lbl}</div>
                      {lbl !== k && <div style={{ color: T.muted, fontSize: 9, fontFamily: T.mono, wordBreak: "break-all" }}>{k}</div>}
                      <div style={{ color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: T.mono, fontSize: 10, marginTop: 2 }}>
                        {typeof parsed[k] === "object" && parsed[k] !== null ? JSON.stringify(parsed[k]) : String(parsed[k])}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })()}
        {draft["Issue Links"] && (() => { let links = []; try { links = typeof draft["Issue Links"] === "string" ? JSON.parse(draft["Issue Links"]) : draft["Issue Links"]; } catch {} if (!Array.isArray(links) || !links.length) return null; return (<div><span style={labelSt}>Issue Links</span><div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>{links.map((lnk, i) => (<div key={lnk.id || i} style={{ fontSize: 11 }}><span style={{ color: T.muted }}>{lnk.direction_label}</span> <span style={{ color: T.accent, cursor: "pointer" }} onClick={() => onSelectRow(lnk.key)}>{lnk.key}</span> {lnk.summary}</div>))}</div></div>); })()}
        {draft.Attachment && (() => { let atts = []; try { atts = typeof draft.Attachment === "string" ? JSON.parse(draft.Attachment) : draft.Attachment; } catch {} if (!Array.isArray(atts) || !atts.length) return null; return (<div><span style={labelSt}>Attachments</span><div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>{atts.map((a, i) => (<div key={i} style={{ fontSize: 11 }}><span style={{ color: T.accent }}>{a.filename}</span> <span style={{ color: T.muted }}>{a.size ? "(" + Math.round(a.size / 1024) + "KB)" : ""}</span></div>))}</div></div>); })()}
        <CommentThread commentsJson={draft.Comment} issueKey={draft["Issue key"]} client={client} busy={busy} onRefresh={() => refreshSingleIssue(draft["Issue key"])} />
        <div style={{ fontSize: 10, color: T.muted, borderTop: "1px solid " + T.border, paddingTop: 8, display: "flex", flexWrap: "wrap", gap: 12 }}>
          {draft.Created && <span>Created: {new Date(draft.Created).toLocaleDateString()}</span>}
          {draft.Updated && <span>Updated: {new Date(draft.Updated).toLocaleDateString()}</span>}
          {draft.Creator && <span>Creator: {draft.Creator}</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480, fontFamily: T.body, color: T.text, background: T.surface }}>
      {/* HEADER */}
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid " + T.border, background: T.card }}>
        <span style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 16, color: T.accent, marginRight: 6 }}>Jira Ticket Tool</span>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", flex: 1, minWidth: 0, overflowX: "auto" }}>
          <button type="button" style={tabStyle(viewMode === "welcome")} onClick={() => setViewMode("welcome")}>Main</button>
          <button type="button" style={tabStyle(viewMode === "list")} onClick={() => setViewMode("list")}>List</button>
          <button type="button" style={tabStyle(viewMode === "kanban")} onClick={() => setViewMode("kanban")}>Kanban</button>
          {issueTabKeys.map((k) => (
            <button key={k} type="button" style={issueTabStyle(viewMode === "issue" && selectedKey === k)} title={k}
              onClick={() => { setSelectedKey(k); setViewMode("issue"); }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0, textAlign: "left" }}>{k}</span>
              <span role="button" tabIndex={0} aria-label={"Close " + k} style={{ fontSize: 16, lineHeight: 1, padding: "0 2px", opacity: 0.75, flexShrink: 0 }} onClick={(e) => closeIssueTab(k, e)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeIssueTab(k, e); } }}>×</span>
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
          <ActionButton label="New Issue" accent onClick={() => createNewLocalTicket()} />
          <ActionButton label="Fetch..." accent disabled={busy} onClick={() => setFetchOpen(true)} />
          <ActionButton label="Refresh all" disabled={busy} onClick={refreshAll} />
          <ActionButton label="Bulk Import" onClick={() => setBulkImportOpen(true)} />
          {selectedKeys.size > 0 && <ActionButton label={"Mass Edit (" + selectedKeys.size + ")"} accent onClick={() => setMassEditOpen(true)} />}
          {selectedKeys.size > 0 && <ActionButton label={"Remove (" + selectedKeys.size + ")"} danger onClick={() => { if (confirm("Remove " + selectedKeys.size + " ticket(s) from your list?")) removeTickets([...selectedKeys]); }} />}
          <ActionButton label="Auto-Fetch" small onClick={() => setAutoFetchOpen(true)} />
          <ActionButton label="Reminders" small onClick={() => setReminderOpen(true)} />
          <ActionButton label="Sync fields" small disabled={busy} onClick={() => syncJiraFieldCatalog()} title="Load all Jira field definitions (entire site) + fields on your default project (e.g. Sundance). Does not require fetching tickets." />
          <ActionButton label="Test Jira" disabled={busy} onClick={testConnection} />
          <ActionButton label="Copy log" small onClick={async () => { try { await navigator.clipboard.writeText(getDebugLogText()); setStatusMsg("Log copied"); } catch { setError("Could not copy"); } }} />
        </div>
        {meta.jira_field_catalog && meta.jira_field_catalog.syncedAt && (
          <span style={{ fontSize: 10, color: T.muted, width: "100%", paddingLeft: 4 }} title={[meta.jira_field_catalog.fieldSearchError, meta.jira_field_catalog.createMetaError, meta.jira_field_catalog.editMetaError, ...((meta.jira_option_catalog && meta.jira_option_catalog.warnings) || [])].filter(Boolean).join(" | ")}>
            Field catalog: {meta.jira_field_catalog.allFieldsCount} site definitions · {meta.jira_field_catalog.projectFieldIds?.length || 0} on project {meta.jira_field_catalog.projectKey} · updated {new Date(meta.jira_field_catalog.syncedAt).toLocaleString()}
            {" · priority:" + ((meta.options && meta.options.Priority || []).length) +
             " resolution:" + ((meta.options && meta.options.Resolution || []).length) +
             " status:" + ((meta.options && meta.options.Status || []).length) +
             " issueType:" + ((meta.options && meta.options["Issue Type"] || []).length) +
             " sprint:" + ((meta.options && meta.options.Sprint || []).length) +
             " components:" + ((meta.options && meta.options.Components || []).length) +
             " fixVer:" + ((meta.options && meta.options["Fix Version"] || []).length) +
             " labels:" + ((meta.options && meta.options.Labels || []).length)}
            {meta.jira_field_catalog.fieldSearchError || meta.jira_field_catalog.createMetaError || meta.jira_field_catalog.editMetaError || (meta.jira_option_catalog && meta.jira_option_catalog.warnings && meta.jira_option_catalog.warnings.length) ? " (warnings — see title)" : ""}
          </span>
        )}
        {notifications.length > 0 && <span style={{ fontSize: 10, color: "#E0A040", marginLeft: 4 }}>{notifications.length} alert(s)</span>}
        {busyDetail && <span style={{ fontSize: 11, color: T.accent, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={busyDetail}>{busyDetail}</span>}
        {statusMsg && <span style={{ fontSize: 11, color: "#4AE08A" }}>{statusMsg}</span>}
        {error && <span style={{ fontSize: 11, color: "#E07070" }}>{error}</span>}
      </header>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* SIDEBAR */}
        <aside style={{ width: 210, flexShrink: 0, overflowY: "auto", borderRight: "1px solid " + T.border, background: T.card, padding: 10, fontSize: 12, fontFamily: T.body }}>
          {/* Templates */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>Templates</span>
            <ActionButton label="+" small accent onClick={() => { const n = prompt("Template name:"); if (n && n.trim()) saveTemplate(n.trim()); }} />
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {Object.keys(templates && typeof templates === "object" ? templates : {}).map((name) => (
              <li key={name} style={{ padding: "3px 6px", borderRadius: 4, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text, display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
                title={name}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(211,166,37,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }} onClick={() => createNewLocalTicket(templates[name])}>{name}</span>
                <span style={{ fontSize: 9, color: T.muted, cursor: "pointer" }} title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateTemplate(name); }}>dup</span>
                <span style={{ fontSize: 9, color: "#E07070", cursor: "pointer" }} title="Delete" onClick={(e) => { e.stopPropagation(); if (confirm('Delete "' + name + '"?')) deleteTemplate(name); }}>x</span>
              </li>
            ))}
          </ul>
          {draft && <div style={{ marginTop: 6 }}><ActionButton label="Save as template" small accent onClick={() => { const n = prompt("Template name:", draft.Summary || ""); if (n && n.trim()) saveTemplate(n.trim()); }} /></div>}

          {/* Folders */}
          <div style={{ marginTop: 14, borderTop: "1px solid " + T.border, paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>Folders</span>
              <ActionButton label="+" small onClick={() => { const n = prompt("Folder name:"); if (n && n.trim()) createFolder(n.trim()); }} />
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {["All", "Unfiled", ...folders].map((f) => (
                <li key={f} style={{ padding: "3px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: activeFolder === f ? 600 : 400, color: activeFolder === f ? T.accent : T.text, background: activeFolder === f ? "rgba(211,166,37,0.1)" : "transparent" }}
                  onClick={() => { setActiveFolder(f); setViewMode("list"); }}>{f}</li>
              ))}
            </ul>
          </div>

          {/* Bundle */}
          <div style={{ marginTop: 14, borderTop: "1px solid " + T.border, paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>Bundle ({bundle.length})</span>
              {bundle.length > 0 && <ActionButton label="Upload" small accent disabled={busy} onClick={uploadBundle} />}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {bundle.map((b, i) => {
                const k = b["Issue key"] || b["Issue id"];
                return (
                  <li key={k + i} style={{ padding: "2px 6px", fontSize: 10, display: "flex", alignItems: "center", gap: 4, color: T.text }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => onSelectRow(k)}>{k}</span>
                    <span style={{ fontSize: 9, color: "#E07070", cursor: "pointer" }} onClick={() => removeFromBundle(i)}>x</span>
                  </li>
                );
              })}
            </ul>
            {draft && <ActionButton label="Add current to bundle" small style={{ marginTop: 4 }} onClick={() => addToBundle(draft)} />}
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {viewMode === "welcome" && (
            <div style={{ overflowY: "auto", height: "100%" }}>
              <WelcomeSection listItems={listItems} meta={meta} onFetch={() => setFetchOpen(true)} onRefreshAll={refreshAll}
                onOpenKey={(key) => onSelectRow(key)}
                onOpenJira={() => { const key = selectedKey || (selectedTicket && selectedTicket["Issue key"]); if (key) openIssueInBrowser(cfg.jiraBaseUrl, key); }} />
            </div>
          )}

          {viewMode === "list" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ display: "flex", gap: 8, padding: 8, borderBottom: "1px solid " + T.border, alignItems: "center" }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="Search..." value={filterText} onChange={(e) => setFilterText(e.target.value)} />
                {selectedKeys.size > 0 && (
                  <select style={{ ...selectStyle, width: "auto", fontSize: 11, padding: "2px 6px" }}
                    value="" onChange={(e) => { if (e.target.value) { moveToFolder([...selectedKeys], e.target.value === "__unfiled" ? "" : e.target.value); } }}>
                    <option value="">Move to folder...</option>
                    <option value="__unfiled">Unfiled</option>
                    {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: T.body }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: T.card, zIndex: 1 }}>
                      <th style={{ padding: "6px 6px", width: 28 }}>
                        <input type="checkbox" checked={selectedKeys.size > 0 && selectedKeys.size === filteredItems.length} onChange={toggleSelectAll} style={{ accentColor: T.accent }} />
                      </th>
                      {["Key", "Summary", "Type", "Status", "Priority", "Assignee", "Int."].map((h) => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted, borderBottom: "1px solid " + T.border }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it) => {
                      const k = it["Issue key"] || it["Issue id"];
                      const sel = k === selectedKey;
                      const isStale = staleDays && checkStale(it, staleDays);
                      return (
                        <tr key={k} style={{ cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.04)", background: sel ? "rgba(211,166,37,0.12)" : "transparent", borderLeft: sel ? "3px solid " + T.accent : "3px solid transparent" }}
                          onClick={() => onSelectRow(k)}
                          onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "rgba(211,166,37,0.05)"; }}
                          onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                          <td style={{ padding: "4px 6px" }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedKeys.has(k)} onChange={() => toggleSelectKey(k)} style={{ accentColor: T.accent }} />
                          </td>
                          <td style={{ padding: "4px 8px", fontFamily: T.mono, fontSize: 10, whiteSpace: "nowrap", color: T.accent }}>
                            {k}{isStale && <span title="Stale" style={{ color: "#E0A040", marginLeft: 4 }}>!</span>}
                          </td>
                          <td style={{ padding: "4px 8px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.Summary}</td>
                          <td style={{ padding: "4px 8px", fontSize: 11 }}>{it["Issue Type"]}</td>
                          <td style={{ padding: "4px 8px", fontSize: 11 }}>{it.Status}</td>
                          <td style={{ padding: "4px 8px", fontSize: 11 }}>{it.Priority}</td>
                          <td style={{ padding: "4px 8px", fontSize: 11 }}>{it.Assignee}</td>
                          <td style={{ padding: "4px 8px", fontSize: 11 }}>{it["Internal Priority"]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === "issue" && (
            <div style={{ height: "100%", overflowY: "auto", overflowX: "hidden", background: T.card, padding: "16px 20px", boxSizing: "border-box", width: "100%", maxWidth: 1100, margin: "0 auto" }}>
              {renderTicketPanel()}
            </div>
          )}

          {viewMode === "kanban" && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ padding: "6px 12px", borderBottom: "1px solid " + T.border, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: T.muted }}>Folder:</span>
                <select style={{ ...selectStyle, width: "auto", fontSize: 11, padding: "2px 8px" }} value={activeFolder} onChange={(e) => setActiveFolder(e.target.value)}>
                  {["All", "Unfiled", ...folders].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flex: 1, gap: 10, overflowX: "auto", padding: 12 }}>
                {kanbanColumns.map((col, colIdx) => {
                  const colItems = filteredItems.filter((it) => columnForTicket(it) === col.name);
                  return (
                    <div key={col.name || colIdx} style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 8, border: "1px solid " + T.border, overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", fontFamily: T.heading, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: T.accent, borderBottom: "1px solid " + T.border, background: "rgba(211,166,37,0.06)" }}>
                        {col.name} ({colItems.length})
                      </div>
                      <div style={{ flex: 1, overflowY: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                        {colItems.map((it) => {
                          const k = it["Issue key"] || it["Issue id"];
                          return (
                            <button key={k} type="button" style={{ textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "1px solid " + T.border, background: T.card, cursor: "pointer", fontFamily: T.body, fontSize: 12 }}
                              onClick={() => onSelectRow(k)}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(211,166,37,0.08)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = T.card; }}>
                              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, marginBottom: 3 }}>{k}</div>
                              <div style={{ color: T.text, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.Summary}</div>
                              {it.Assignee && <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{it.Assignee}</div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==== DIALOGS ==== */}

      {/* Structured Fetch Dialog */}
      {fetchOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", borderRadius: 10, border: "1px solid " + T.border, background: T.card, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
            <h3 style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 600, color: T.text, margin: "0 0 12px" }}>Fetch My Issues</h3>
            <label style={{ display: "block", marginBottom: 10 }}><span style={labelSt}>Project key</span>
              <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                <input style={{ ...inputStyle, width: 140 }} value={fetchProjectKey} onChange={(e) => setFetchProjectKey(e.target.value)} placeholder="SUNDANCE" />
                <span style={{ fontSize: 11, color: T.muted }}>(blank = SUNDANCE)</span>
              </div>
            </label>
            <div style={{ marginBottom: 10 }}><span style={labelSt}>Assignee / Reporter:</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                {[["assigned", "Assigned to me"], ["created", "Created by me"], ["both", "Assigned OR Created by me"], ["any", "Anyone (no restriction)"]].map(([v, l]) => (
                  <label key={v} style={radioLabelSt}><input type="radio" name="fetchScope" checked={fetchScope === v} onChange={() => setFetchScope(v)} style={{ accentColor: T.accent }} />{l}</label>
                ))}
              </div>
            </div>
            <FilterMultiSelect label="Filter by Labels" value={fetchLabelFilter} onChange={setFetchLabelFilter} options={(meta.options && meta.options.Labels) || []} matchMode={fetchLabelMode} onMatchModeChange={setFetchLabelMode} />
            <FilterMultiSelect label="Filter by Components" value={fetchCompFilter} onChange={setFetchCompFilter} options={(meta.options && meta.options.Components) || []} matchMode={fetchCompMode} onMatchModeChange={setFetchCompMode} />
            <FilterMultiSelect label="Filter by Issue Type" value={fetchTypeFilter} onChange={setFetchTypeFilter} options={(meta.options && meta.options["Issue Type"]) || []} />
            <FilterMultiSelect label="Filter by Status" value={fetchStatusFilter} onChange={setFetchStatusFilter} options={(meta.options && meta.options.Status) || []} />
            <FilterMultiSelect label="Filter by Priority" value={fetchPriorityFilter} onChange={setFetchPriorityFilter} options={(meta.options && meta.options.Priority) || []} />
            <label style={{ display: "block", marginBottom: 10 }}><span style={labelSt}>Save to folder (optional)</span>
              <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                <input style={{ ...inputStyle, flex: 1 }} value={fetchFolder} onChange={(e) => setFetchFolder(e.target.value)} placeholder="Leave blank for no folder" />
                <ActionButton label="Auto-name" small onClick={() => setFetchFolder(fetchProjectKey + " " + new Date().toISOString().slice(0, 10))} />
              </div>
            </label>
            <label style={{ display: "block", marginBottom: 8 }}><span style={labelSt}>Max issues</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                <input type="number" style={{ ...inputStyle, width: 100 }} min={0} max={999999} value={fetchMax} onChange={(e) => setFetchMax(Math.max(0, Math.min(999999, Number(e.target.value) || 0)))} />
                <span style={{ fontSize: 11, color: T.muted }}>Use <strong style={{ color: T.text }}>0</strong> for no limit — Jira is queried in pages of 100 until every matching issue is listed, then each issue is loaded with full fields (*all).</span>
              </div>
            </label>
            {(busy || fetchLogLines.length > 0) && (
              <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, border: "1px solid " + T.border, background: "rgba(211,166,37,0.06)", maxHeight: 280, overflow: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.accent }}>Fetch progress</div>
                {busyDetail && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.mono, lineHeight: 1.35 }}>{busyDetail}</div>
                )}
                <pre style={{
                  margin: 0, padding: 10, fontSize: 11, fontFamily: T.mono, lineHeight: 1.45, color: T.text,
                  whiteSpace: "pre-wrap", wordBreak: "break-word", overflowY: "auto", flex: 1, minHeight: 80,
                  background: "rgba(0,0,0,0.08)", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)",
                }}>{fetchLogLines.join("\n")}</pre>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <ActionButton label="Cancel" disabled={busy} onClick={() => { if (!busy) { setFetchOpen(false); setFetchLogLines([]); } }} />
              <ActionButton label="Fetch" accent disabled={busy} onClick={() => runStructuredFetch({
                scope: fetchScope, projectKey: fetchProjectKey,
                labelFilter: fetchLabelFilter, labelMode: fetchLabelMode,
                componentFilter: fetchCompFilter, componentMode: fetchCompMode,
                typeFilter: fetchTypeFilter, statusFilter: fetchStatusFilter,
                priorityFilter: fetchPriorityFilter, maxResults: fetchMax,
              }, fetchFolder)} />
            </div>
          </div>
        </div>
      )}

      {/* Auto-Fetch Settings */}
      {autoFetchOpen && (() => {
        const afc = meta.auto_fetch_config || {};
        const update = (key, val) => {
          const next = { ...meta, auto_fetch_config: { ...afc, [key]: val } };
          persist(templates, next, listItems);
        };
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}>
            <div style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", borderRadius: 10, border: "1px solid " + T.border, background: T.card, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
              <h3 style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 600, color: T.text, margin: "0 0 12px" }}>Auto-Fetch Settings</h3>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input type="checkbox" checked={!!afc.enabled} onChange={(e) => update("enabled", e.target.checked)} style={{ accentColor: T.accent }} />
                <span style={{ fontSize: 13 }}>Enable daily auto-fetch</span>
              </label>
              <label style={{ display: "block", marginBottom: 8 }}><span style={labelSt}>Scope</span>
                <select style={{ ...selectStyle, marginTop: 4 }} value={afc.scope || "assigned"} onChange={(e) => update("scope", e.target.value)}>
                  <option value="assigned">Assigned to me</option><option value="created">Created by me</option>
                  <option value="both">Assigned OR Created</option><option value="any">Anyone</option>
                </select>
              </label>
              <label style={{ display: "block", marginBottom: 8 }}><span style={labelSt}>Project key</span>
                <input style={{ ...inputStyle, marginTop: 4 }} value={afc.project_key || ""} onChange={(e) => update("project_key", e.target.value)} />
              </label>
              <label style={{ display: "block", marginBottom: 8 }}><span style={labelSt}>Max issues (0 = all matching)</span>
                <input type="number" style={{ ...inputStyle, marginTop: 4 }} min={0} max={999999} value={afc.max_results != null ? afc.max_results : 0} onChange={(e) => update("max_results", Math.max(0, Math.min(999999, Number(e.target.value) || 0)))} />
              </label>
              <label style={{ display: "block", marginBottom: 8 }}><span style={labelSt}>Folder</span>
                <input style={{ ...inputStyle, marginTop: 4 }} value={afc.folder_name || ""} onChange={(e) => update("folder_name", e.target.value)} />
              </label>
              <p style={{ fontSize: 11, color: T.muted }}>Last run: {afc.last_run_date || "never"}</p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <ActionButton label="Run Now" accent disabled={busy} onClick={() => {
                  setAutoFetchOpen(false);
                  runStructuredFetch({ scope: afc.scope || "assigned", projectKey: afc.project_key || "SUNDANCE",
                    labelFilter: afc.label_filter || [], labelMode: afc.label_mode || "any",
                    componentFilter: afc.component_filter || [], componentMode: afc.component_mode || "any",
                    typeFilter: afc.type_filter || [], statusFilter: afc.status_filter || [],
                    priorityFilter: afc.priority_filter || [], maxResults: afc.max_results != null ? afc.max_results : 0,
                  }, afc.folder_name || "").then(() => update("last_run_date", new Date().toISOString().slice(0, 10)));
                }} />
                <ActionButton label="Close" onClick={() => setAutoFetchOpen(false)} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reminder / Stale Settings */}
      {reminderOpen && (() => {
        const rc = meta.reminder_config || {};
        const levels = meta.internal_priority_levels || ["High", "Medium", "Low", "None"];
        const updateRC = (level, type) => {
          const next = { ...meta, reminder_config: { ...rc, [level]: { type } } };
          persist(templates, next, listItems);
        };
        const toggleStale = (val) => persist(templates, { ...meta, stale_ticket_enabled: val }, listItems);
        const setStaleDays = (val) => persist(templates, { ...meta, stale_ticket_days: val }, listItems);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}>
            <div style={{ width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", borderRadius: 10, border: "1px solid " + T.border, background: T.card, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
              <h3 style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 600, color: T.text, margin: "0 0 12px" }}>Reminders & Stale Tickets</h3>
              <p style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Set reminder frequency per internal priority level.</p>
              {levels.map((lvl) => (
                <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 80, fontSize: 12, fontWeight: 600 }}>{lvl}</span>
                  <select style={{ ...selectStyle, width: "auto", fontSize: 11, padding: "2px 6px" }}
                    value={(rc[lvl] || {}).type || "never"} onChange={(e) => updateRC(lvl, e.target.value)}>
                    <option value="daily">Daily</option><option value="weekly">Weekly</option>
                    <option value="on_open">On open</option><option value="never">Never</option>
                  </select>
                </div>
              ))}
              <div style={{ marginTop: 16, borderTop: "1px solid " + T.border, paddingTop: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={!!meta.stale_ticket_enabled} onChange={(e) => toggleStale(e.target.checked)} style={{ accentColor: T.accent }} />
                  <span style={{ fontSize: 13 }}>Enable stale ticket detection</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12 }}>Days until stale:</span>
                  <input type="number" style={{ ...inputStyle, width: 60 }} value={meta.stale_ticket_days || 14} onChange={(e) => setStaleDays(Number(e.target.value) || 14)} />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <ActionButton label="Close" onClick={() => setReminderOpen(false)} />
              </div>
            </div>
          </div>
        );
      })()}

      {massEditOpen && <MassEditDialog selectedKeys={selectedKeys} listItems={listItems} meta={meta} client={client} busy={busy} onClose={() => setMassEditOpen(false)} onDone={() => { setMassEditOpen(false); refreshAll(); }} />}
      {bulkImportOpen && <BulkImportDialog templates={templates} meta={meta} onClose={() => setBulkImportOpen(false)}
        onImport={(tickets) => {
          const nb = [...bundle, ...tickets];
          setBundle(nb);
          persist(templates, { ...meta, bundle: nb }, [...tickets, ...listItems]);
          setStatusMsg("Imported " + tickets.length + " ticket(s) to bundle.");
          setViewMode("list");
        }} />}
    </div>
  );
}