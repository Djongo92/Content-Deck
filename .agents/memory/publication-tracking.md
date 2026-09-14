---
name: Publication tracking
description: How Content Desk distinguishes scheduled content from content confirmed as published.
---

# Publication tracking

Content Desk records the actual time a user marks an item published separately from its planned publish date. Completion, streak, and reporting metrics should use the actual publication timestamp, falling back to the planned date only for older records that predate this distinction.

**Why:** schedules routinely change; counting planned dates as completed output makes weekly and monthly results inaccurate.

**How to apply:** preserve the scheduled `publishAt` date for calendar planning, and set/clear the actual publication timestamp only through the published/unpublished action. Any new completion metric should use the actual timestamp first.