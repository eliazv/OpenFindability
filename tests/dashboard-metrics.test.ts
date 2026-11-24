import test from "node:test";
import assert from "node:assert/strict";
import { dayRange, measure, measureRatio, parseDays, validDay } from "../lib/dashboard/metrics";
test("missing remains null, zero remains a real measurement",()=>{
  const m=measure([{date:"2026-11-02",value:0}],dayRange("2026-11-03",3));
  assert.equal(m.value,0);assert.equal(m.observed,1);assert.equal(m.points[0].current,null);assert.equal(m.points[1].current,0);assert.equal(m.delta,null);
});
test("complete comparison, same length, previous zero has no percent",()=>{
  const m=measure([{date:"2026-11-01",value:0},{date:"2026-11-02",value:5}],dayRange("2026-11-02",1));
  assert.equal(m.delta,5);assert.equal(m.deltaPercent,null);
});
test("mixed currencies never aggregate",()=>{
  const m=measure([{date:"2026-11-01",value:1,currency:"USD"},{date:"2026-11-02",value:2,currency:"EUR"}],dayRange("2026-11-02",2),"sum",true);
  assert.equal(m.value,null);assert.ok(m.warning);
});
test("snapshot never sums and does not forward fill",()=>{
  const m=measure([{date:"2026-11-01",value:5},{date:"2026-11-02",value:8}],dayRange("2026-11-03",3),"snapshot");
  assert.equal(m.value,8);assert.equal(m.points[2].current,null);assert.equal(m.delta,null);
});
test("date validation and bounded window",()=>{assert.equal(validDay("2026-02-30"),false);assert.equal(parseDays("9999"),28);});

test("ratio aggregates weighted by denominator rather than average of daily ratios",()=>{
 const m=measureRatio([{date:"2026-11-01",numerator:1,denominator:10},{date:"2026-11-02",numerator:10,denominator:1000}],dayRange("2026-11-02",2),100);
 assert.ok(Math.abs(m.value!-11/1010*100)<1e-10);assert.equal(m.observed,2);
});
