import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/index.js";

test("greet builds a greeting", () => {
    assert.equal(greet("world"), "Hello, world!");
});
