export class ContractError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ContractError';
    this.details = details;
  }
}
