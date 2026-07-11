# Phase 5 Context

GitHub support is provider-neutral at the core boundary and offline-testable. Reads may probe repository state; every write is planned without side effects first and requires a granted, unexpired approval scoped to the exact correlation target. Live writes remain an explicit external gate.

