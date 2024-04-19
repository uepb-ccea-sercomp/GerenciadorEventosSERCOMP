import { Request, Response } from "express";
import { RegisterUserRequestParams } from "../interfaces/registerUserRequestParam";
import { createUser, findUserByEmail } from "../repositories/userRepository";
import { createUserAtividade } from "../repositories/userAtividadeRepository";
import { findActivityById } from "../repositories/activityRepository";
import { createPayment } from "../services/payments/createPayment";
import { getPayment } from "../services/payments/getPayment";
import { UserLoginParams } from "../interfaces/userLoginParams";
import jsonwebtoken from "jsonwebtoken";

export async function loginUser(req: Request, res: Response) {
  const params: UserLoginParams = req.body;

  const { email, senha } = params;

  const userExists = await findUserByEmail(email);

  if (!userExists) {
    return res.status(401).send("email não encontrado");
  }

  if (userExists.senha === senha) {
    return res.status(401).send("Senha inválida!");
  }

  const token = jsonwebtoken.sign(
    {
      id: userExists.uuid_user,
    },
    String(process.env.SECRET),
    {
      expiresIn: "4h",
    }
  );

  return res.status(200).json({ token: token });
}

export async function registerUser(req: Request, res: Response) {
  try {
    const {
      nome,
      email,
      instituicao,
      nome_cracha,
      atividades,
    }: RegisterUserRequestParams = req.body;

    const { lote_id } = req.params;

    const use_id = await createUser({ nome, nome_cracha, email, instituicao });

    const activities_ids = [
      atividades?.minicurso_id,
      atividades?.oficina_id,
      atividades?.workshop_id,
    ];

    if (activities_ids.length == 0) {
      throw new Error("É necessário se matricula em pelo menos uma atividade");
    }

    for (const uuid_atividade of activities_ids) {
      if (uuid_atividade) {
        const activity_exits = await findActivityById(uuid_atividade);

        if (!activity_exits) {
          throw new Error("UUID inválido!");
        }

        await createUserAtividade(use_id, uuid_atividade);
      }
    }

    const user = await createPayment(use_id, lote_id);

    return res.status(200).json(user);
  } catch (error) {
    res.status(400).json(error);
  }
}

export async function getUserInscricao(req: Request, res: Response) {
  try {
    const { payment_id } = req.params;

    const payment = await getPayment(payment_id);

    res.status(200).json(payment);
  } catch (error) {
    res.status(400).send(error);
  }
}
