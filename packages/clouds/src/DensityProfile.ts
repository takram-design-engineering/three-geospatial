export interface DensityProfileLike
  extends Partial<
    Pick<DensityProfile, 'expTerm' | 'exponent' | 'linearTerm' | 'constantTerm'>
  > {}

export class DensityProfile {
  expTerm: number
  exponent: number
  linearTerm: number
  constantTerm: number

  constructor(expTerm = 0, exponent = 0, linearTerm = 0, constantTerm = 0) {
    this.expTerm = expTerm
    this.exponent = exponent
    this.linearTerm = linearTerm
    this.constantTerm = constantTerm
  }

  set(expTerm = 0, exponent = 0, linearTerm = 0, constantTerm = 0): this {
    this.expTerm = expTerm
    this.exponent = exponent
    this.linearTerm = linearTerm
    this.constantTerm = constantTerm
    return this
  }

  clone(): DensityProfile {
    return new DensityProfile(
      this.expTerm,
      this.exponent,
      this.linearTerm,
      this.constantTerm
    )
  }

  copy(other: DensityProfile): this {
    this.expTerm = other.expTerm
    this.exponent = other.exponent
    this.linearTerm = other.linearTerm
    this.constantTerm = other.constantTerm
    return this
  }
}
