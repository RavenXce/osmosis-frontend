import { AmountConfig } from '@keplr-wallet/hooks';
import { ChainGetter } from '@keplr-wallet/stores';
import { ObservableQueryBalances } from '@keplr-wallet/stores/build/query/balances';
import { AppCurrency } from '@keplr-wallet/types';
import { CoinPretty, Dec, Int, IntPretty } from '@keplr-wallet/unit';
import { action, computed, makeObservable, observable, override } from 'mobx';
import { useState } from 'react';
import { ObservableQueryPools } from 'src/stores/osmosis/query/pools';

export class PoolSwapConfig extends AmountConfig {
	@observable.ref
	protected _queryPools: ObservableQueryPools;

	@observable
	protected inCurrencyMinimalDenom: string = '';
	@observable
	protected outCurrencyMinimalDenom: string = '';

	constructor(
		chainGetter: ChainGetter,
		initialChainId: string,
		sender: string,
		queryBalances: ObservableQueryBalances,
		poolId: string,
		queryPools: ObservableQueryPools
	) {
		super(chainGetter, initialChainId, sender, undefined, queryBalances);

		this._poolId = poolId;
		this._queryPools = queryPools;

		makeObservable(this);
	}

	@observable
	protected _poolId: string;

	get poolId(): string {
		return this._poolId;
	}

	get queryPools(): ObservableQueryPools {
		return this._queryPools;
	}

	get pool() {
		return this.queryPools.getObservableQueryPool(this.poolId);
	}

	get sendableCurrencies(): AppCurrency[] {
		const pool = this.pool.pool;
		if (!pool) {
			return [];
		}

		return pool.poolAssets
			.map(asset => asset.amount.currency)
			.sort((asset1, asset2) => {
				// XXX: For some marketing reasons..., just sort the currencies to locate the regen token to the end.
				//      (Initially, no users have the regen token, so anyone can sell the regen.)
				if (asset1.coinMinimalDenom === 'ibc/1DCC8A6CB5689018431323953344A9F6CC4D0BFB261E88C9F7777372C10CD076') {
					return 1;
				}
				if (asset2.coinMinimalDenom === 'ibc/1DCC8A6CB5689018431323953344A9F6CC4D0BFB261E88C9F7777372C10CD076') {
					return -1;
				}
				return 0;
			});
	}

	@override
	get sendCurrency(): AppCurrency {
		if (this.inCurrencyMinimalDenom) {
			const find = this.sendableCurrencies.find(cur => cur.coinMinimalDenom === this.inCurrencyMinimalDenom);
			if (find) {
				return find;
			}
		}

		return this.sendableCurrencies[0];
	}

	@computed
	get outCurrency(): AppCurrency {
		if (this.outCurrencyMinimalDenom) {
			const find = this.sendableCurrencies.find(cur => cur.coinMinimalDenom === this.outCurrencyMinimalDenom);
			if (find) {
				return find;
			}
		}

		return this.sendableCurrencies[1];
	}

	@computed
	get outAmount(): CoinPretty {
		const pool = this.pool.pool;
		if (!pool) {
			return new CoinPretty(this.outCurrency, new Dec(0));
		}

		if (this.getError() != null) {
			return new CoinPretty(this.outCurrency, new Dec(0));
		}

		try {
			const estimated = pool.estimateSwapExactAmountIn(
				{
					currency: this.sendCurrency,
					amount: this.amount,
				},
				this.outCurrency
			);

			return estimated.tokenOut;
		} catch {
			return new CoinPretty(this.outCurrency, new Dec(0));
		}
	}

	@computed
	get spotPriceWithoutSwapFee(): IntPretty {
		const pool = this.pool.pool;

		if (!pool) {
			return new IntPretty(new Int(0));
		}

		return pool.calculateSpotPriceWithoutSwapFee(this.sendCurrency.coinMinimalDenom, this.outCurrency.coinMinimalDenom);
	}

	@computed
	get swapFee(): IntPretty {
		const pool = this.pool.pool;
		if (!pool) {
			return new IntPretty(new Int(0));
		}

		return pool.swapFee;
	}

	@computed
	get estimatedSlippage(): IntPretty {
		const pool = this.pool.pool;
		if (!pool) {
			return new IntPretty(new Int(0));
		}

		if (this.getError() != null) {
			return new IntPretty(new Int(0));
		}

		try {
			const estimated = pool.estimateSwapExactAmountIn(
				{
					currency: this.sendCurrency,
					amount: this.amount,
				},
				this.outCurrency
			);

			return estimated.slippage;
		} catch {
			return new IntPretty(new Int(0));
		}
	}

	@action
	setPoolId(poolId: string) {
		this._poolId = poolId;
	}

	@action
	setQueryPools(queryPools: ObservableQueryPools) {
		this._queryPools = queryPools;
	}

	@action
	setInCurrency(minimalDenom: string) {
		this.inCurrencyMinimalDenom = minimalDenom;
	}

	@action
	setOutCurrency(minimalDenom: string) {
		this.outCurrencyMinimalDenom = minimalDenom;
	}

	@action
	switchInAndOut() {
		const inCurrency = this.sendCurrency;
		const outCurrency = this.outCurrency;

		const outAmount = this.outAmount;

		this.setIsMax(false);

		this.setInCurrency(outCurrency.coinMinimalDenom);
		this.setOutCurrency(inCurrency.coinMinimalDenom);

		this.setAmount(
			outAmount
				.trim(true)
				.maxDecimals(6)
				.shrink(true)
				.hideDenom(true)
				.locale(false)
				.toString()
		);
	}

	@override
	setAmount(amount: string) {
		this.setIsMax(false);
		super.setAmount(amount);
	}
}

export const usePoolSwapConfig = (
	chainGetter: ChainGetter,
	chainId: string,
	sender: string,
	queryBalances: ObservableQueryBalances,
	poolId: string,
	queryPools: ObservableQueryPools
) => {
	const [config] = useState(() => new PoolSwapConfig(chainGetter, chainId, sender, queryBalances, poolId, queryPools));
	config.setChain(chainId);
	config.setSender(sender);
	config.setQueryBalances(queryBalances);
	config.setPoolId(poolId);
	config.setQueryPools(queryPools);

	return config;
};
