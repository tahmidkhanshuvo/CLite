import type { Session } from "./sessions";

declare global {
  namespace Express {
    interface Request { workspace: Session; }
  }
}
