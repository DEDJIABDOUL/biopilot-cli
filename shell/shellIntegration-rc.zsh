# BIOPILOT: M2 the session's token, kept in a variable no program sees (not exported, removed first).
typeset -g __is_session_token="${BIOPILOT_SESSION_TOKEN:-}"
unset BIOPILOT_SESSION_TOKEN

autoload -U add-zsh-hook

if [[ -f $USER_ZDOTDIR/.zshrc ]]; then
	ZDOTDIR=$USER_ZDOTDIR
	. $USER_ZDOTDIR/.zshrc
fi

__is_prompt_start() {
	builtin printf '\e]6973;PS\a' > /dev/tty
}

__is_prompt_end() {
	builtin printf '\e]6973;PE\a' > /dev/tty
}

__is_escape_value() {
	builtin emulate -L zsh

	# Process text byte by byte, not by codepoint.
	builtin local LC_ALL=C str="$1" i byte token out=''

	for (( i = 0; i < ${#str}; ++i )); do
		byte="${str:$i:1}"

		# Escape backslashes and semi-colons
		if [ "$byte" = "\\" ]; then
			token="\\\\"
		elif [ "$byte" = ";" ]; then
			token="\\x3b"
		elif [ "$byte" = $'\n' ]; then
			token="\x0a"
		elif [ "$byte" = $'\e' ]; then
			token="\\x1b"
		elif [ "$byte" = $'\a' ]; then
			token="\\x07"
		else
			token="$byte"
		fi

		out+="$token"
	done

	builtin print -r "$out"
}

__is_update_cwd() {
	builtin printf '\e]6973;CWD;%s\a' "$(__is_escape_value "${PWD}")"
}

# BIOPILOT: M2 report the environment BioPilot needs to find the binaries the shell would run.
__is_update_env() {
	builtin printf '\e]6973;ENV;%s;%s;%s\a' "$__is_session_token" "$(__is_escape_value "${PATH}")" "$(__is_escape_value "${CONDA_PREFIX:-}")"
}

__is_precmd() {
	__is_update_cwd
	__is_update_env
	if [[ $BIOPILOT_TESTING == "1" ]]; then
		PS1="%{$(__is_prompt_start)%}> %{$(__is_prompt_end)%}"
	fi
}

if (( ${+widgets[zle-line-init]} )); then
	zle -A zle-line-init __is_orig_zle_line_init
	__is_zle_line_init() {
		__is_prompt_start
		zle __is_orig_zle_line_init
		__is_prompt_end
	}
else
	__is_zle_line_init() {
		__is_prompt_start
		__is_prompt_end
	}
fi
zle -N zle-line-init __is_zle_line_init

# BIOPILOT: create-cd begin. `biopilot create --print <project>` creates the project and enters it: a program
# cannot change its shell's folder, so the shell runs the printed line itself, once checked to be the
# `mkdir -p … && cd …` line. Every other biopilot command runs as is.
biopilot() {
	local __is_name=
	if [ "$#" -eq 3 ] && [ "$1" = create ]; then
		if [ "$2" = --print ]; then __is_name=$3; elif [ "$3" = --print ]; then __is_name=$2; fi
	fi
	case "$__is_name" in
	"" | -*)
		command biopilot "$@"
		return
		;;
	esac
	local __is_create_line
	__is_create_line="$(command biopilot create --print "$__is_name")" || return
	case "$__is_create_line" in
	"mkdir -p "*) ;;
	*)
		builtin printf '%s\n' "$__is_create_line"
		return 1
		;;
	esac
	builtin printf '%s\n' "$__is_create_line"
	builtin eval "$__is_create_line"
}
# BIOPILOT: create-cd end

add-zsh-hook precmd __is_precmd