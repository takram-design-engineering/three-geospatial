export interface DensityProfileLike
  extends Partial<
    Pick<DensityProfile, 'expTerm' | 'exponent' | 'linearTerm' | 'constantTerm'>
  > {}

export class DensityProfile {
  constructor(
    public expTerm = 0,
    public exponent = 0,
    public linearTerm = 0,
    public constantTerm = 0
  ) {}

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
