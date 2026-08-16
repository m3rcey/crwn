# The Algorithm

Operating principles paraphrased from Jon McNeill's *The Algorithm*. Five steps, applied in order,
plus three cultural lenses. This file is stable methodology. It carries no CRWN facts, because CRWN
facts go stale and methodology does not.

The order is the whole point. Speeding up a step that should have been deleted is worse than doing
nothing, because it makes the wrong thing permanent.

---

## Step 1. Question every requirement

For each proposed item:

- Why does this need to exist?
- What actual problem requires it?
- Who or what created the requirement, and are they still right?
- Is it a real constraint or an inherited assumption?
- Is it required by customer behavior, money, security, law, product strategy, or repository
  reality?
- Or is it convention, future-proofing, preference, fear, an edge case, or "this would be cool"?
- What evidence says this problem matters **now**?
- What happens if CRWN simply does not do it?

**The burden of proof is on adding work, not on deleting it.** A requirement that applies to
everything or everyone deserves the hardest questioning, because that is where inherited
assumptions hide.

A requirement traced to a specific named person, a real incident, a live customer, or a law
survives this step. A requirement traced to "we always do it this way" usually does not.

## Step 2. Delete every possible step

Before improving anything, try to remove it entirely. Delete parts, steps, abstractions, state,
code, dependencies, processes, and requirements.

> If you are never adding something back, you are not deleting aggressively enough.

Deletion is a test of the boundary, so it should occasionally go too far. It should never go too
far on money, security, ownership, entitlement, legal, or data-integrity controls. Those are
governed by the hard safety gates in [DECISION-FRAMEWORK.md](DECISION-FRAMEWORK.md).

**For an existing surface, "delete" is never a single word.** Name the reversibility level:

1. **Hide** the surface (remove the nav entry, tile, or card). Code stays. Instantly reversible.
2. **Flag off** through the `admin_settings` flag system. Reversible in one SQL update.
3. **Delete the code**, keep the database tables and their data.
4. **Delete the code and drop the tables.** Only for something that has never held a row.

Prefer the cheapest level that actually removes the founder attention cost. Hiding a surface that
the founder still has to keep truthful in five other places has not removed the cost; be honest
about which level is required.

Deleting a surface is not the same as deleting the concept. Many surfaces are pure derived reads of
data another system already owns, so cutting the surface loses nothing.

## Step 3. Simplify and optimize

Only for items that survived questioning and deletion.

- What is the smallest version that produces the required outcome?
- Can existing architecture already do this?
- Can two steps become one?
- Can an existing component or system absorb the responsibility?
- Can an optional setting become a sensible default?
- Can the feature be a manual process for now?
- Can the hypothesis be tested without building the system?
- Can founder effort or customer effort disappear behind the scenes?

For a workflow, **map the current process before redesigning it**, and separate:

- **Cycle time**: how long the whole thing takes end to end.
- **Touch time**: how much actual work is inside it.

A long process with very little touch time is not a hard process. It is exposing waiting, handoffs,
queueing, or steps that should not exist. Fix that, not the work.

## Step 4. Accelerate cycle time

Never accelerate something that should have been removed or redesigned first.

Once the process is necessary and simple:

- What is the end-to-end cycle time?
- What is the slowest step?
- What delays customer value?
- What delays learning?
- What delays revenue?
- What delays knowing whether the hypothesis was right?

Acceleration is valuable because it makes the company **learn faster**, not because it lets the
founder finish more tasks. Shortening the loop between an action and its observable result is worth
more than shortening the action.

Value most highly whatever shortens the loop that the **current stage** depends on. Derive that
loop from current evidence rather than assuming it. In a pre-product-market-fit stage the loop
typically runs from a qualified customer through setup, launch, first revenue, observed result, and
learning; at a later stage it is something else.

## Step 5. Automate last

Automation is treated with more skepticism than anything else, because it converts a process into a
permanent artifact that must be maintained, explained, monitored, and kept in sync.

Before recommending automation, all six must be true:

1. The process needs to exist at all.
2. It has been run or observed enough to be understood.
3. Unnecessary steps have already been removed.
4. It is simple.
5. It is reasonably stable, not changing every week.
6. Its output is worth maintaining forever.

If any is false, prefer, in order: manual execution, a lightweight workaround, an existing tool, an
existing internal primitive, or a deliberately temporary process.

**Do not write software because a manual process feels inelegant.** Inelegance is cheap. A wrong
automation is expensive twice: once to build, and again every time it must be kept true.

An automation proposed after a process has run once has not met condition 2. That is not a
judgment about the idea, it is a statement about the sample size.

---

# The three cultural lenses

Secondary to the five steps, and used to break ties or to catch a decision the steps alone would
get wrong.

## A. The customer's entire experience

Do not define the product by a single feature. Ask what happens before, during, and after the
customer touches it, and where the experience actually breaks.

Broader scope is **not** automatically better. A wider responsibility earns its place only when it
materially affects adoption, monetization, successful delivery, retention, or the current stage's
exit condition. Do not build an adjacent experience merely because it could be owned.

## B. Urgency and accountability

Find the **largest current constraint**, not the longest list. Founder attention should be
concentrated on the few things capable of moving that constraint.

A task that is useful someday can still be the wrong task today. Saying that plainly is the value
of the audit.

## C. Eat your own dog food

Weigh observed pain over imagined pain.

**More weight:** actual customer behavior, actual funnel data, actual failed attempts, actual
founder use, actual support issues, production usage, real conversion and revenue evidence.

**Less weight:** speculative edge cases, hypothetical future scale, imagined requests,
architecture built "for later".

If the problem can be experienced or tested manually before anything is built, recommend doing that
first. One real run beats a design document.

**"Unknown" is not "zero".** A measured zero is evidence. An absence of telemetry is not. When a
decision hinges on an unknown, name the single measurement that would settle it.
