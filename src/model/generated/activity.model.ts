import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Token} from "./token.model"
import {Owner} from "./owner.model"
import {ActivityType} from "./_activityType"

@Entity_()
export class Activity {
  constructor(props?: Partial<Activity>) {
    Object.assign(this, props)
  }

  @PrimaryColumn_()
  id!: string

  @Index_()
  @ManyToOne_(() => Token, {nullable: false})
  token!: Token

  @Index_()
  @ManyToOne_(() => Owner, {nullable: true})
  from!: Owner | undefined | null

  @Index_()
  @ManyToOne_(() => Owner, {nullable: true})
  to!: Owner | undefined | null

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: true})
  price!: bigint | undefined | null

  @Column_("varchar", {length: 8, nullable: false})
  type!: ActivityType

  @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
  timestamp!: bigint

  @Column_("int4", {nullable: false})
  block!: number

  @Column_("text", {nullable: false})
  transactionHash!: string
}
