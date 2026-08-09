import test from "node:test";
import assert from "node:assert/strict";
import {
  checkDrawnLabels,
  checkThesisGrounded,
  checkGenericCopy,
} from "../scripts/check-script.mjs";

const recon = {
  identity: { name: "Acme" },
  copy: ["Run a scan", "Export report", "Share with your team"],
  elements: [{ label: "Run a scan" }, { label: "Export report" }],
};

test("drawn labels taken from recon pass", () => {
  const script = {
    lines: [
      { id: "l1", show: { type: "typography", render: { archetype: "chips", items: ["Run a scan"] } } },
    ],
  };
  assert.deepEqual(checkDrawnLabels(script, recon), []);
});

test("an invented drawn label fails and quotes it", () => {
  const script = {
    lines: [
      {
        id: "l1",
        show: { type: "typography", render: { archetype: "chips", items: ["Run a scan", "AI Copilot"] } },
      },
    ],
  };
  const [f] = checkDrawnLabels(script, recon);
  assert.equal(f.severity, "fail");
  assert.match(f.message, /AI Copilot/);
});

test("labels inside a hero shot's render are checked too", () => {
  const script = {
    lines: [
      {
        id: "l2",
        show: {
          type: "interaction",
          recording: "scan",
          shots: [{ frames: 3, render: { archetype: "fan", items: ["Invented Heading"] } }],
        },
      },
    ],
  };
  const [f] = checkDrawnLabels(script, recon);
  assert.match(f.message, /Invented Heading/);
});

test("a thesis naming something in recon passes", () => {
  assert.deepEqual(
    checkThesisGrounded({ thesis: "One scan and the report is already written." }, recon),
    [],
  );
});

test("a thesis grounded in nothing fails", () => {
  const [f] = checkThesisGrounded(
    { thesis: "Unlock unprecedented productivity at massive scale." },
    recon,
  );
  assert.equal(f.severity, "fail");
  assert.match(f.message, /names nothing/);
});

test("plain copy passes the register check", () => {
  assert.deepEqual(
    checkGenericCopy({ lines: [{ id: "l1", say: "You run the scan. The report writes itself." }] }),
    [],
  );
});

test("marketing register fails and quotes the offending word", () => {
  const [f] = checkGenericCopy({
    lines: [{ id: "l1", say: "Seamlessly unlock powerful insights." }],
  });
  assert.equal(f.severity, "fail");
  assert.match(f.message, /seamlessly|powerful/i);
  assert.equal(f.target, "lines[0].say");
});

test("a word that merely contains a banned word is not flagged", () => {
  assert.deepEqual(
    checkGenericCopy({ lines: [{ id: "l1", say: "The unlocked door stayed open." }] }),
    [],
  );
});
