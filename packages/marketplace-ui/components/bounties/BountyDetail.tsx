import { Alert, Box, Button, ButtonProps, Divider, Heading, HStack, Image, Input, InputGroup, InputProps, InputRightElement, Link, SimpleGrid, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  Creator, roundToDecimals, useBondingPricing,
  useMint,
  useOwnedAmount, useReserveAmount, useStrataSdks, useTokenBondingFromMint,
  useTokenMetadata
} from "@strata-foundation/react";
import React, { useMemo, useState } from "react";
import { AsyncButton } from "../AsyncButton";
import { DisburseFunds } from "./DisburseFunds";
import { AuthorityAndTokenInfo } from "./AuthorityAndTokenInfo";
import { numberWithCommas } from "utils/numberWithCommas";
import { BountyCardContribution } from "./BountyCardContribution";
import { TopHolders } from "./TopHolders";
import { toNumber } from "@strata-foundation/spl-token-bonding";
import { BurnButton } from "../BurnButton";

export const AsyncQtyButton = ({
  inputProps = {},
  buttonProps = {},
  action,
  children,
  validate,
  symbol
}: {
  symbol?: string;
  children: React.ReactNode;
  inputProps?: InputProps;
  buttonProps?: ButtonProps;
  action: (args: { quantity: number }) => Promise<void> | undefined;
  validate?: (args: { quantity: number }) => string | null;
}) => {
  const [qty, setQty] = useState("");
  const validation = React.useMemo(
    () => validate && validate({ quantity: Number(qty) }),
    [validate, qty]
  );

  return (
    <HStack w="full" justify="flex-start">
      <Box flexGrow={1}>
        <InputGroup>
          <Input
            type="number"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
            }}
            {...inputProps}
          />
          <InputRightElement
            pr={"6px"}
            fontSize="16px"
            fontWeight={700}
            color="gray.500"
          >
            {symbol}
          </InputRightElement>
        </InputGroup>
      </Box>

      <AsyncButton
        {...buttonProps}
        action={() => action({ quantity: Number(qty) })}
        isDisabled={validation ? true : false}
      >
        {validation ? validation : children}
      </AsyncButton>
    </HStack>
  );
};

export const BountyDetail = ({
  name,
  description,
  image,
  mintKey,
}: {
  mintKey?: PublicKey;
  name: string;
  description: string;
  image: string;
}) => {
  const { info: tokenBonding, loading: bondingLoading } =
    useTokenBondingFromMint(mintKey);
  const { connected, publicKey } = useWallet();
  const targetMint = useMint(tokenBonding?.targetMint);
  const {
    image: targetImage,
    metadata: targetMetadata,
    data: targetData,
    loading: targetMetaLoading,
  } = useTokenMetadata(tokenBonding?.targetMint);
  const { metadata: baseMetadata, loading: metadataLoading } = useTokenMetadata(
    tokenBonding?.baseMint
  );
  const { pricing, loading: pricingLoading } =
    useBondingPricing(tokenBonding?.publicKey);
  const { tokenBondingSdk } = useStrataSdks();
  const baseBalance = useOwnedAmount(tokenBonding?.baseMint);
  const targetBalance = useOwnedAmount(tokenBonding?.targetMint);
  const reserveAmount = useReserveAmount(tokenBonding?.publicKey);
  const [isWithdraw, setIsWithdraw] = useState(false);
  const fundsUsed = useMemo(
    () => {
      if (targetMint && pricing && typeof reserveAmount !== "undefined") {
        return (
          toNumber(targetMint.supply, targetMint) - reserveAmount
        );
      }
    },
    [pricing, targetMint, targetMint?.supply, reserveAmount]
  );
  const fundsHaveBeenUsed: boolean = !!fundsUsed && (fundsUsed > 0);
  const bountyClosed = !tokenBonding && !bondingLoading;

  const attributes = React.useMemo(
    () =>
      targetData?.attributes?.reduce((acc, att) => {
        if (att.trait_type) acc[att.trait_type] = att.value;
        return acc;
      }, {} as Record<string, string | number>),
    [targetData]
  );

  const isAdmin =
    publicKey &&
    (tokenBonding?.reserveAuthority as PublicKey | undefined)?.equals(
      publicKey
    );
  name = targetMetadata?.data.name || name;
  image = targetImage || image;
  description = targetData?.description || description;

  const dataMissing = !name && !image && !description;

  if (!metadataLoading && dataMissing) {
    return <Text>Not found</Text>;
  }

  if (dataMissing) {
    return <Spinner />;
  }

  return (
    <VStack p={8} spacing={4} w="full">
      <Heading textAlign="center">{name}</Heading>
      <AuthorityAndTokenInfo mintKey={mintKey} />
      <Text
        w="full"
        align="left"
        fontSize="15px"
        color="gray.500"
        whiteSpace="pre-line"
      >
        {description}

        {"\n"}
        {attributes?.discussion && `Discussion: ${attributes.discussion}\n`}
        {attributes?.contact && `Contact: ${attributes.contact}`}
      </Text>
      {fundsHaveBeenUsed && (
        <Alert status="error">
          Funds have been disbursed from this bounty without closing it.
          Existing contributors may not be able to withdraw what they put into
          the bounty. Contact the bounty authority if you have any questions
        </Alert>
      )}

      {bountyClosed && (
        <>
          <Alert status="error">This bounty has been closed. You can burn the bounty tokens if you no longer have use for them. </Alert>
          { mintKey && <BurnButton mintKey={mintKey} /> }
        </>
      )}
      {!bountyClosed && (
        <>
          <SimpleGrid
            w="full"
            justify="stretch"
            columns={[1, 1, 2]}
            spacing={2}
            gap={2}
          >
            <BountyCardContribution
              amount={reserveAmount}
              symbol={baseMetadata?.data.symbol}
            />
            <BountyCardContribution
              amount={
                typeof targetBalance === "undefined"
                  ? undefined
                  : pricing?.sellTargetAmount(targetBalance)
              }
              symbol={baseMetadata?.data.symbol}
              text="My Contributions"
            />
          </SimpleGrid>

          <VStack align="flex-end" w="full">
            <AsyncQtyButton
              buttonProps={{
                colorScheme: "orange",
                w: "180px",
              }}
              symbol={baseMetadata?.data.symbol}
              validate={({ quantity }) => {
                if (isWithdraw) {
                  if (pricing) {
                    const actualQuantity = -pricing.buyWithBaseAmount(
                      -quantity
                    );
                    if (!targetBalance || targetBalance < actualQuantity) {
                      return "Insufficient funds";
                    }

                    if (!connected) {
                      return "Connect Wallet";
                    }
                  }

                  return null;
                } else {
                  if (!baseBalance || baseBalance < quantity) {
                    return "Insufficient funds";
                  }

                  if (!connected) {
                    return "Connect Wallet";
                  }
                }

                return null;
              }}
              action={async ({ quantity }) => {
                if (isWithdraw && pricing) {
                  await tokenBondingSdk?.sell({
                    targetAmount: -pricing.buyWithBaseAmount(-quantity),
                    tokenBonding: tokenBonding?.publicKey!,
                    slippage: 0,
                  });
                } else if (!isWithdraw) {
                  await tokenBondingSdk?.buy({
                    baseAmount: quantity,
                    tokenBonding: tokenBonding?.publicKey!,
                    slippage: 0,
                  });
                }
              }}
            >
              {isWithdraw ? "Withdraw Funds" : "Contribute Funds"}
            </AsyncQtyButton>
            <Button
              onClick={() => setIsWithdraw(!isWithdraw)}
              fontWeight={400}
              w="180px"
              variant="link"
              size="sm"
              colorScheme="orange"
            >
              {isWithdraw ? "Contribute Funds" : "Withdraw Funds"}
            </Button>
          </VStack>
          <Divider color="gray.200" />
          {isAdmin && tokenBonding && (
            <>
              <Heading alignSelf="flex-start" size="sm">
                Disburse Funds
              </Heading>
              <DisburseFunds tokenBondingKey={tokenBonding?.publicKey} />
              <Divider color="gray.200" />
            </>
          )}
          <Heading mb={"-6px"} alignSelf="flex-start" size="sm">
            Top Contributors
          </Heading>
          <TopHolders mintKey={mintKey} />
        </>
      )}
    </VStack>
  );
};