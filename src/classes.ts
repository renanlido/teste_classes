import { randomUUID } from "crypto";

export class Operation {
  private _id: string
  private _operationStartTime: Date;
  private _operationEndTime?: Date;
  constructor(){
    this._id = randomUUID()
    this._operationStartTime = new Date()
  }

  get Id(){
    return this._id;
  }

  public endOperation(){
    this._operationEndTime = new Date()
  }

  public operationTime(){
    if(!this._operationStartTime){
      throw new Error('Operação nem começou!!')
    }

    if(!this._operationEndTime){
      throw new Error('Operação não terminou!!!')
    }

    return this._operationEndTime.getTime() - this._operationStartTime.getTime()
  }
}

interface Sensors {
  name: string;
  type: 'startOperation' | 'endOperation'
  value: string;
  clp: string;
  id: string;
}

interface CommandGate {
  abreCancela: (id: string) => Promise<{type: "success" | "failure", message: string}>
  fechaCancela: (id: string) => Promise<Boolean>
  consultaEstadoCancela: (id: string) => Promise<"aberto"| "fechado"> 
}

abstract class CancelaBase {
  protected _id: string
  protected estadoCancela: "aberto" | "fechado" = "fechado"
  constructor(protected command: CommandGate){
    this._id = randomUUID()
  }

  public abstract abreCancela(): Promise<void>;

  public abstract fechaCancela(): Promise<void>;
}

export class Cancela extends CancelaBase {

  public async abreCancela(){
    let count = 0

    do {
    //pause de 2 segundos
      count++
      const retorno = await this.command.abreCancela(this._id)

      if(retorno.type === "failure"){
        throw new Error(retorno.message)
      }

      const estadoCancela = await this.command.consultaEstadoCancela(this._id)

     this.estadoCancela = estadoCancela

     if(count >= 3){
      throw new Error("tempo limite .....")
     }
    } while(this.estadoCancela !== "aberto")
  }

  public async fechaCancela(){}

}

abstract class LaneFlowBase{
  public abstract getFlow(): void
  public abstract getState(): void
}
class LaneDuasEntradasUmaSaida extends LaneFlowBase{
  public getFlow(): void {
    throw new Error("Method not implemented.");
  }
  public getState(): void {
    throw new Error("Method not implemented.");
  }

}
export abstract class LaneDefault{

}

export class Lane extends LaneDefault {
  private _inOperation: Boolean = false;
  public operation: Operation | null = null
  private _id: string
  constructor(public nome: string, public sensors: Sensors[]){
    this._id = randomUUID()
  }

  public id(){
    return this._id;
  }

  public startOperation(){
    if(this._inOperation){
      throw new Error('O viado, não pode iniciar operação, seu burro')
    }

    this._inOperation = true
    this.operation = new Operation()
  }

  public endOperation(){
    if(!this.operation){
      throw new Error('Nenhuma operação iniciada!!')
    }

    this.operation.endOperation()
    this._inOperation = false;
    this.operation = null;
  }


  public isInOperation(){
    return this._inOperation;
  }

  public setOperation(){
    this.operation = new Operation()
  }
  get OperationId(){
    return this.operation?.Id;
  }

}