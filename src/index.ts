import { Lane } from "./classes";

const bancoDeDados = [{
  name: "Lane 1"
}, {
  name: "Lane 2"
}]


const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  
  const lanes: Lane[] = []

  for(const item of bancoDeDados){
    lanes.push(new Lane(item.name))
  }

  await pause(1000);

  const redisSinalInicioOp = {
    laneName: 'Lane1'
  }

 console.log("Comando Recebido: ", redisSinalInicioOp);

  const findLane = lanes.find(item => item.nome = redisSinalInicioOp.laneName);

  if(!findLane){
    throw new Error("tem isso não meu camarada")
  }

  const lane1 = findLane
  console.log(lane1)

  console.log("Está em operação?: ", lane1.isInOperation())
  lane1.startOperation()

  await pause(3000);
  console.log("Está em operação?: ", lane1.isInOperation())
  
  await pause(3000);
  lane1.endOperation()
  
  // while(true){
  //   await pause(3000);
  //   console.log("tem Evento?")
  // }

  await pause(3000);
  console.log("Está em operação?: ", lane1.isInOperation())

  console.log("Tempo da operação: ",lane1.operation?.operationTime())
  console.log(lane1.isInOperation())
  lane1.startOperation()

  const lane2 = new Lane('Lane 1')
  
  console.log(lane2)
}

main();
