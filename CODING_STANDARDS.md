# Coding Standards and Engineering Contract

> **Polish pipeline:** When generating repo `CODING_STANDARDS.md` during `/auto-polish-code`, follow `.cursor/docs/ENGINEERING_BASELINE.md` (standalone, paradigm lock, no path-specific citations).

## 1) Mission
Build software that is easy to understand, easy to extend, and safe to evolve over time.
Every change must improve or preserve architectural clarity, not just pass tests.

## 2) Scope
These standards apply to all first-party code, tests, automation, and technical documentation.
Third-party/vendor code is out of scope except at integration boundaries.

## 3) Non-Negotiable Principles
- **Evidence before assertion**: claims must be backed by code, runtime output, or tests.
- **Honest analysis first**: evaluate the true quality of existing code before changing it.
- **Design over patch speed**: do not trade long-term architecture for short-term convenience.
- **Explicit behavior change**: intended behavior changes require tests and documentation.
- **Ownership and contracts**: every externally visible behavior has a clear owner and interface contract.
- **Design for future change**: optimize for additive feature work without structural rewrites.

## 4) Future-Proof Architecture and Structure

### Required outcomes
- A new contributor can quickly find where to add or modify a feature.
- New features are added through extension seams, not cross-cutting edits.
- Change impact remains localized to the feature boundary.
- Core domain behavior is insulated from delivery/runtime/infrastructure details.

### Structure rules
- Organize by business/domain capability first, technical layer second.
- Separate domain behavior, use-case orchestration, and integration concerns.
- Keep contracts (interfaces/ports) distinct from implementations when practical.
- Enforce one-way dependency flow toward stable abstractions.
- Keep modules cohesive and bounded to one primary responsibility.

### Architecture styles (allowed)
- Layered architecture with strict dependency rules.
- Hexagonal (ports and adapters).
- Clean architecture.
- Modular monolith with bounded contexts.

Any style is acceptable only when boundaries, ownership, and dependency direction are explicit and enforced.

## 5) OOP Design Principles (Required)
- Apply SOLID consistently:
  - Single Responsibility Principle (SRP)
  - Open/Closed Principle (OCP)
  - Liskov Substitution Principle (LSP)
  - Interface Segregation Principle (ISP)
  - Dependency Inversion Principle (DIP)
- Prefer composition over inheritance unless inheritance represents a true subtype relationship.
- Encapsulate mutable state and expose behavior through explicit methods.
- Use dependency injection or explicit constructor/parameter wiring for dependencies.
- Keep object lifecycle ownership explicit.
- Prefer rich domain models for non-trivial business logic.

## 6) Design Patterns (Use Intentionally)
Use patterns only when they reduce complexity and improve extensibility/testability.

- **Strategy**: policy or algorithm variation.
- **Factory / Builder**: controlled object creation complexity.
- **Adapter / Facade**: external system boundaries.
- **Command**: decoupled feature invocation or operation execution.
- **Observer (or event-driven equivalent)**: decoupled notifications.
- **State**: behavior that depends on lifecycle/state transitions.
- **Template Method** (or policy injection equivalent): shared workflow with variable steps.

Reject pattern usage when it adds abstraction without real variability or boundary value.

## 7) Rewrite vs Patch Policy (Agent-Critical)
Before implementation, explicitly decide: patch, refactor, restructure, or rewrite.

### Prefer bounded rewrite/restructure when one or more are true
- Existing code violates architecture boundaries.
- Patching would add coupling, special cases, or hidden dependencies.
- Feature delivery requires repeated edits across unrelated modules.
- The change cannot fit naturally without exceptions to standards.
- The section is already low-quality and blocks safe extension.

### Prefer patch/refactor when all are true
- Existing boundaries remain valid.
- Change impact is localized.
- Complexity does not materially increase.
- No architectural debt is introduced.

Never force legacy code to fit by layering workaround-on-workaround. If clean fit is not possible, redesign the bounded area.

## 8) Implementation Workflow (Agent Execution Contract)
For substantial changes, execute in this order:
1. Discover current boundaries, contracts, and ownership.
2. Perform honest patch-vs-rewrite evaluation.
3. Select architecture/pattern approach for expected future change.
4. Design module/object changes before coding.
5. Implement cohesive, bounded updates.
6. Run targeted checks, then full quality gates.
7. Re-verify claims about behavior, architecture, and maintainability with evidence.

## 9) Quality Gates and Verification
Minimum required checks before integration:
- formatting checks
- lint/static analysis checks
- type/interface checks (if applicable)
- unit tests for changed behavior
- integration tests for impacted flows

Rules:
- Every behavior change must be covered by tests.
- Every new extension seam must have tests proving safe substitution/extension.
- Failures must be diagnosable through explicit error handling and useful observability.

## 10) Maintainability and Continuity Standards
- Code must be readable and navigable for contributors unfamiliar with the history.
- Naming must reflect domain intent, not incidental implementation details.
- Public/shared contracts should be backward compatible by default.
- Material design and architecture decisions must be documented (for example, ADRs).
- Onboarding-level docs must be sufficient for a new engineer to add a feature safely.

## 11) Anti-Patterns (Rejected)
- Hidden global state.
- God objects/modules.
- Mixed unrelated responsibilities in one module/class.
- Copy/paste-driven extensibility.
- Catch-all exception handling that hides root causes.
- Cross-module edits as the normal path for small feature changes.
- Patch chains that preserve bad structure instead of fixing it.

## 12) Definition of Done
A change is done only when all are true:
- Architecture boundaries are clear and coherent.
- Quality gates pass.
- Behavior changes are tested and documented.
- Evidence supports all technical claims.
- The result improves or preserves future feature velocity without requiring structural rewrites.

## 13) References
- SOLID and OOD fundamentals: [Object Mentor - The Principles of OOD](https://web.archive.org/web/20240201000000*/http://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod)
- Patterns catalog: [Refactoring.Guru - Design Patterns](https://refactoring.guru/design-patterns)
- Architecture guidance: [Martin Fowler](https://martinfowler.com/)
- Bounded context: [Fowler - Bounded Context](https://martinfowler.com/bliki/BoundedContext.html)
- Dependency inversion and DI: [Fowler - Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html)
- Architecture decision records: [ADR](https://adr.github.io/)
- Architecture communication model: [C4 Model](https://c4model.com/)
