import test from "node:test";
import assert from "node:assert/strict";
import {csvText} from "../lib/dashboard/csv";
test("csv escapes quotes and neutralizes formula strings but preserves numeric negatives",()=>{assert.equal(csvText(["Query","Valore"],[['=1+1',-1],['a"b',null]]),'"Query";"Valore"\r\n"\'=1+1";"-1"\r\n"a""b";""');});
