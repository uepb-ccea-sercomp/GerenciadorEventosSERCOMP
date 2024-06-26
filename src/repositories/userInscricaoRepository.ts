import { Prisma, StatusPagamento, TipoAtividade, Usuario } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { deleteAllActivityByUserAndType, replaceActivity } from "./userAtividadeRepository";

export async function createUserInscricao(
  tx: Prisma.TransactionClient,
  user_uuid: string,
  lote_id: string,
  payment_id: string,
  expiration_date: string,
) {
  return await tx.userInscricao.create({
    data: {
      uuid_user : user_uuid,
      uuid_lote : lote_id,
      credenciamento: false,
      id_payment_mercado_pago: payment_id,
      expiration_datetime: expiration_date,
      status_pagamento: "PENDENTE",
    },
  });
}

export async function findLoteIdAndUserIdByEmail(event_id: string, email: string) {
  const user = await prisma.usuario.findUniqueOrThrow({
    where: {
      email
    }
  })

  const lote = await prisma.lote.findFirstOrThrow({
    where: {
      uuid_evento: event_id
    }
  })

  return {
    uuid_user: user?.uuid_user,
    uuid_lote: lote?.uuid_lote
  }
}

export async function findUserInscricaoByEventId(uuid_user: string, uuid_evento: string) {
  //Só pode existir 1 inscrição por evento, independetemente da quantidade de lotes!
  const lote = await prisma.lote.findFirst({
    where: {
      uuid_evento,
    }
  });

  if (!lote) {
    throw new Error(`Nenhum lote encontrado para o evento com ID ${uuid_evento}.`);
  }

  const user_inscricao = await prisma.userInscricao.findUnique({
    where: {
      uuid_lote_uuid_user: {
        uuid_lote: lote.uuid_lote,
        uuid_user,
      },
    },
  });

  return user_inscricao;
}

export async function findUserInscricaoById(uuid_user: string, uuid_lote: string){
  const user_inscricao = await prisma.userInscricao.findUnique({
    where: {
      uuid_lote_uuid_user: {
        uuid_lote,
        uuid_user
      }
    }
  })

  return user_inscricao;
}

export async function findUserInscricaoByMercadoPagoId(
  id_payment_mercado_pago: string
) {
  const user_inscricao = await prisma.userInscricao.findFirst({
    where: {
      id_payment_mercado_pago,
    },
  });

  if (!user_inscricao) {
    throw new Error("UUID não encontrado!");
  }

  return user_inscricao;
}

export async function findUserInscricaoByUserAndLote(userId : string, loteId : string) {
  try {
    const inscricao = await prisma.userInscricao.findUnique({
      where: {
        uuid_lote_uuid_user: {
          uuid_user: userId,
          uuid_lote: loteId
        }
      },
    });
    return inscricao;
  } catch (error) {
    throw error;
  }
}

export async function changeStatusPagamento(
  uuid_user: string,
  uuid_lote: string,
  status_pagamento: StatusPagamento
) {
  await prisma.userInscricao.update({
    where: {
      uuid_lote_uuid_user: {
        uuid_user,
        uuid_lote
      },
    },
    data: {
      status_pagamento,
    },
  });
}

export async function changeStatusPagamentoToREALIZADO(uuid_lote: string, uuid_user: string){
  console.log(uuid_lote, uuid_user)
  
  const user_inscricao = await prisma.userInscricao.update({
    where: {
      uuid_lote_uuid_user: {
        uuid_lote,
        uuid_user
      }
    },
    data: {
      status_pagamento: "REALIZADO"
    }
  });

  return user_inscricao;
}

export async function findAllSubscribersInEvent(event_id: string) {
  const event_exists = await prisma.evento.findUnique({
    where: {
      uuid_evento: event_id
    }
  });

  if(!event_exists){
    throw new Error("UUID incorreto!");
  }

  const all_subscribers = await prisma.userInscricao.findMany({
    where: {
      lote: {
        uuid_evento: event_id,
      },
    },
    select: {
      uuid_user: true,
      credenciamento: true,
      id_payment_mercado_pago: true,
      status_pagamento: true,
      usuario: {
        select: {
          nome: true,
          email: true,
        },
      },
    },
  });

  return all_subscribers;
}

export async function findAllEventsByUserId(uuid_user: string){
  try {
    const eventos = await prisma.evento.findMany({
      where: {
        uuid_user_owner: uuid_user,
      },
      select: {
        uuid_evento: true,
        nome: true
      }
    });

    return eventos;
  } catch (error) {
    console.error("Erro ao buscar eventos:", error);
    throw error;
  }
}

export interface ActivityUpdate {
  id: string;
  type: TipoAtividade;
}

export const removeActivityIfTypeNull = async (user_id: string, activities: ActivityUpdate[] = []) => {
  const minicurso = activities.find(e => e.type === "MINICURSO");
  const oficina = activities.find(e => e.type === "OFICINA");
  const workshop = activities.find(e => e.type === "WORKSHOP");
  const palestra = activities.find(e => e.type === "PALESTRA");
  if(!minicurso){
    deleteAllActivityByUserAndType(user_id, "MINICURSO");
  }
  if(!oficina){
    deleteAllActivityByUserAndType(user_id, "OFICINA");
  }
  if(!workshop){
    deleteAllActivityByUserAndType(user_id, "WORKSHOP");
  }
  if(!palestra){
    deleteAllActivityByUserAndType(user_id, "PALESTRA");
  }
}

export async function updateParticipante(
  user_id: string,
  nome: string,
  nome_cracha: string,
  email: string,
  instituicao: string,
  status_pagamento?: StatusPagamento,
  activities: ActivityUpdate[] = []
): Promise<Usuario> {
  const updatedUser = await prisma.usuario.update({
    where: { uuid_user: user_id },
    data: {
      nome,
      nome_cracha,
      email,
      instituicao,
    },
  });

  await removeActivityIfTypeNull(user_id, activities);

  const updateActivities = activities.map((activity) =>
    replaceActivity(user_id, activity.id, activity.type)
  );

  let updatePaymentStatus;
  if (status_pagamento) {
    updatePaymentStatus = prisma.userInscricao.updateMany({
      where: {
        uuid_user: user_id,
      },
      data: {
        status_pagamento,
      },
    });
  }

  await Promise.all([...updateActivities, updatePaymentStatus]);

  return updatedUser;
}

export const projectionTableCredenciamento = async  (event_id: string) => {
  const users = await prisma.userInscricao.findMany({
    where: {
      uuid_lote: {
        in: await prisma.lote.findMany({
          where: { uuid_evento: event_id },
          select: { uuid_lote: true },
        }).then((lotes) => lotes.map((lote) => lote.uuid_lote)),
      },
    },
    select: {
      usuario: {
        select: {
          uuid_user: true,
          nome: true,
          email: true,
          nome_cracha: true,
        },
      },
      status_pagamento: true,
      uuid_lote: true,
      credenciamento: true,
    },
    orderBy: {
      usuario: {
        nome: 'asc'
      }
    }
  });

  return users.map((userInscricao) => ({
    uuid_user: userInscricao.usuario.uuid_user,
    nome: userInscricao.usuario.nome,
    nome_cracha: userInscricao.usuario.nome_cracha,
    email: userInscricao.usuario.email,
    uuid_lote: userInscricao.uuid_lote,
    status_pagamento: userInscricao.status_pagamento,
    credenciamento: userInscricao.credenciamento,
  }));
}

export const findUserInscriptionStatus = async (event_id: string) => await prisma.userInscricao.findMany({
  where: {
    lote: {
      evento: {
        uuid_evento: event_id,
      },
    },
  },
  include: {
    lote: true,
  },
});

export async function findAllUserInEventByStatusPagamento(
  uuid_evento: string,
  status_pagamento: StatusPagamento
) {
  const users = await prisma.userInscricao.findMany({
    where: {
      lote: {
        evento: {
          uuid_evento,
        },
      },
      AND: {
        status_pagamento,
      },
    },
    select: {
      uuid_user: true,
      usuario: {
        select: {
          nome: true,
          email: true,
        },
      },
    },
    orderBy: {
      usuario: {
        nome: 'asc'
      }
    }
  });

  return users;
}

export async function changeCredenciamentoValue(uuid_user: string, uuid_lote: string, credenciamento_value: boolean){
  await prisma.userInscricao.update({
    where: {
      uuid_lote_uuid_user: {
        uuid_lote,
        uuid_user
      }
    },
    data: {
      credenciamento: credenciamento_value
    }
  })
}