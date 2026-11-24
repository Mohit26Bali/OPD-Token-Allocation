export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_TRANSITION');
  }
}

export class CapacityExceededError extends DomainError {
  constructor(message: string) {
    super(message, 'CAPACITY_EXCEEDED');
  }
}

export class SlotClosedError extends DomainError {
  constructor(message: string) {
    super(message, 'SLOT_CLOSED');
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
  }
}

export class IncompatibleDoctorError extends DomainError {
  constructor(message: string) {
    super(message, 'INCOMPATIBLE_DOCTOR');
  }
}
